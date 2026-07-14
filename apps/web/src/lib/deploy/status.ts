/**
 * Deploy-progress model shared by the server (route handler + manage page) and the client
 * `DeployProgress` component.
 *
 * The shapes here are plain, serializable data — the server maps live provider results into a
 * {@link DeployStatus} and the client renders it. Only *types* are imported from
 * `@pagewright/github`, so this module stays safe to include in a client bundle.
 */

import type {
  PagesInfo,
  PagesStatusState,
  Repo,
  WorkflowJob,
  WorkflowRun,
  WorkflowRunConclusion,
  WorkflowRunStatus,
} from "@pagewright/github";

/** High-level phase the whole deployment is in — drives the banner + polling loop. */
export type DeployPhase =
  | "none" // no run yet (repo just created, first push not observed)
  | "queued" // a run exists but hasn't started executing
  | "building" // a run is executing (or Pages is still building)
  | "success" // the latest run succeeded and Pages is live
  | "failed"; // the latest run failed / was cancelled

export interface DeployStep {
  name: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  number: number;
}

export interface DeployJob {
  id: number;
  name: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  htmlUrl: string | null;
  steps: DeployStep[];
}

export interface DeployRun {
  id: number;
  name: string | null;
  headSha: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  htmlUrl: string;
  runNumber: number;
  event: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeployStatus {
  owner: string;
  repo: string;
  repoUrl: string;
  /** Current default-branch head, used to recognize when a newer commit superseded a tracked save. */
  branchHeadSha: string | null;
  /** Live Pages URL once known (from Pages API or derived on the repo). */
  liveUrl: string | null;
  pagesEnabled: boolean;
  pagesStatus: PagesStatusState;
  run: DeployRun | null;
  jobs: DeployJob[];
  phase: DeployPhase;
  /** Server clock at capture time — lets the client show a stable "as of" and age. */
  fetchedAt: string;
}

const TERMINAL_RUN_STATES: ReadonlySet<WorkflowRunStatus> = new Set(["completed"]);

/** True once the deployment has reached a state that no longer needs polling. */
export function isDeployTerminal(phase: DeployPhase): boolean {
  return phase === "success" || phase === "failed";
}

/** Derive the overall {@link DeployPhase} from the latest run + Pages status. */
export function deriveDeployPhase(
  run: DeployRun | null,
  pagesStatus: PagesStatusState,
): DeployPhase {
  if (!run) {
    // No run observed yet. If Pages is already building/built, reflect that; else nothing yet.
    if (pagesStatus === "building") return "building";
    if (pagesStatus === "built") return "success";
    if (pagesStatus === "errored") return "failed";
    return "none";
  }

  if (!TERMINAL_RUN_STATES.has(run.status)) {
    return run.status === "queued" || run.status === "requested" || run.status === "pending"
      ? "queued"
      : "building";
  }

  // Run is completed — lean on its conclusion, then let Pages gate "fully live".
  if (run.conclusion === "success") {
    // Run finished but Pages may still be flipping building → built.
    return pagesStatus === "building" ? "building" : "success";
  }
  if (run.conclusion === "failure" || run.conclusion === "timed_out") return "failed";
  if (run.conclusion === "cancelled") return "failed";
  // neutral / skipped / action_required / null → treat as still settling.
  return pagesStatus === "built" ? "success" : "building";
}

function toDeployRun(run: WorkflowRun): DeployRun {
  return {
    id: run.id,
    name: run.name,
    headSha: run.headSha,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.htmlUrl,
    runNumber: run.runNumber,
    event: run.event,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function toDeployJob(job: WorkflowJob): DeployJob {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    htmlUrl: job.htmlUrl,
    steps: job.steps.map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
    })),
  };
}

/**
 * Map a live snapshot (repo + Pages + latest run + its jobs) into the serializable
 * {@link DeployStatus} the UI consumes. Pure so both the route and the page reuse it.
 */
export function buildDeployStatus(input: {
  owner: string;
  repo: Repo;
  pages: PagesInfo | null;
  run: WorkflowRun | null;
  jobs: WorkflowJob[];
  branchHeadSha: string | null;
}): DeployStatus {
  const run = input.run ? toDeployRun(input.run) : null;
  const pagesStatus: PagesStatusState = input.pages?.status ?? "unknown";
  const liveUrl = input.pages?.url ?? input.repo.pagesUrl ?? null;

  return {
    owner: input.owner,
    repo: input.repo.name,
    repoUrl: input.repo.htmlUrl,
    branchHeadSha: input.branchHeadSha,
    liveUrl,
    pagesEnabled: input.pages?.enabled ?? false,
    pagesStatus,
    run,
    jobs: input.jobs.map(toDeployJob),
    phase: deriveDeployPhase(run, pagesStatus),
    fetchedAt: new Date().toISOString(),
  };
}

/** Flatten all job steps into a single ordered list for a compact "steps" rail. */
export function flattenSteps(jobs: DeployJob[]): DeployStep[] {
  return jobs.flatMap((j) => j.steps);
}
