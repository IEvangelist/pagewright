/**
 * The shape of everything Pagewright needs from GitHub, expressed as plain data + one interface.
 *
 * Two implementations satisfy {@link GitHubProvider}: a token-backed REST provider (used for both
 * OAuth-App user tokens and GitHub-App installation tokens — the wire calls are identical) and an
 * in-memory mock (so the builder is fully demoable with no credentials). Swapping auth strategies
 * never touches call sites.
 */

export type ProviderKind = "oauth" | "app" | "mock";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface Repo {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
  topics: string[];
  homepage: string | null;
  pushedAt: string | null;
  hasDiscussions: boolean;
  /** The live GitHub Pages URL when it can be derived; null when Pages is not enabled. */
  pagesUrl: string | null;
}

export interface DiscussionCategory {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
}

export interface DiscussionSetup {
  repo: string;
  repoId: string;
  enabled: boolean;
  private: boolean;
  categories: DiscussionCategory[];
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  topics?: string[];
  /** Seed the repo with an empty initial commit so a default branch exists to commit onto. */
  autoInit?: boolean;
  homepage?: string;
}

export interface CommitFile {
  path: string;
  /** File contents. Text by default; set `encoding: "base64"` for binary (e.g. uploaded media). */
  content: string;
  encoding?: "utf-8" | "base64";
}

export interface CommitOptions {
  message: string;
  files: CommitFile[];
  /** Paths to delete in the same atomic commit. */
  deletions?: string[];
  /** Target branch; defaults to the repo's default branch. */
  branch?: string;
  /**
   * Optimistic-concurrency guard. When set, the commit only applies if the branch still points at
   * this SHA; otherwise a {@link ConcurrencyError} is thrown so the caller can reconcile.
   */
  expectedHeadSha?: string;
}

export interface CommitResult {
  sha: string;
  htmlUrl: string;
  branch: string;
}

export interface PullRequestFilesOptions {
  branch: string;
  baseBranch: string;
  baseSha: string;
  title: string;
  body: string;
  message: string;
  files: CommitFile[];
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
  branch: string;
}

export interface FileContents {
  content: string;
  sha: string;
  path: string;
}

export interface Base64FileContents {
  contentBase64: string;
  sha: string;
  path: string;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
}

export type PagesStatusState =
  | "not_enabled"
  | "building"
  | "built"
  | "errored"
  | "unknown";

export interface PagesInfo {
  enabled: boolean;
  url: string | null;
  status: PagesStatusState;
  cname: string | null;
}

export interface EnablePagesOptions {
  /** "workflow" = GitHub Actions build (Pagewright default); "legacy" = build from a branch. */
  buildType?: "workflow" | "legacy";
  branch?: string;
  path?: string;
}

export type WorkflowRunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending"
  | "unknown";

export type WorkflowRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  htmlUrl: string;
  headBranch: string | null;
  headSha: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
}

export interface WorkflowJobStep {
  name: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  number: number;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  htmlUrl: string | null;
  steps: WorkflowJobStep[];
}

export interface ListWorkflowRunsOptions {
  branch?: string;
  event?: string;
  perPage?: number;
  /** Restrict results to a workflow file such as "deploy.yml". */
  workflowFile?: string;
}

/**
 * The single seam through which the app touches GitHub. Everything above the provider (dashboard,
 * provisioning, publishing, deploy-progress polling) is written against this and never against a
 * concrete auth strategy.
 */
export interface GitHubProvider {
  readonly kind: ProviderKind;

  getAuthenticatedUser(): Promise<GitHubUser>;

  /** Repos this account owns that carry the Pagewright topic (its managed sites). */
  listManagedRepos(topic?: string): Promise<Repo[]>;
  getRepo(ref: RepoRef): Promise<Repo | null>;
  getDiscussionSetup(ref: RepoRef): Promise<DiscussionSetup | null>;
  enableDiscussions(ref: RepoRef): Promise<DiscussionSetup>;
  createRepo(opts: CreateRepoOptions): Promise<Repo>;
  deleteRepo(ref: RepoRef): Promise<void>;

  /** Atomic multi-file commit via the Git Data API (blobs → tree → commit → ref update). */
  commitFiles(ref: RepoRef, opts: CommitOptions): Promise<CommitResult>;
  /** Create a branch, commit managed files to it, and open a pull request against the base branch. */
  createPullRequestWithFiles(
    ref: RepoRef,
    opts: PullRequestFilesOptions,
  ): Promise<PullRequestResult>;
  getFile(ref: RepoRef, path: string, branch?: string): Promise<FileContents | null>;
  /** Read a binary file without converting its bytes through UTF-8. */
  getFileBase64(ref: RepoRef, path: string, branch?: string): Promise<Base64FileContents | null>;
  /** List the entries of a directory at a ref. Returns [] when the directory is absent. */
  listDirectory(ref: RepoRef, path: string, branch?: string): Promise<DirEntry[]>;
  /** Current HEAD SHA of a branch (used for conflict detection on save). */
  getBranchHead(ref: RepoRef, branch?: string): Promise<string | null>;

  enablePages(ref: RepoRef, opts?: EnablePagesOptions): Promise<PagesInfo>;
  getPages(ref: RepoRef): Promise<PagesInfo>;
  disablePages(ref: RepoRef): Promise<void>;

  listWorkflowRuns(ref: RepoRef, opts?: ListWorkflowRunsOptions): Promise<WorkflowRun[]>;
  getWorkflowRun(ref: RepoRef, runId: number): Promise<WorkflowRun | null>;
  listWorkflowJobs(ref: RepoRef, runId: number): Promise<WorkflowJob[]>;
  /** Kick a workflow_dispatch (e.g. "publish now"). */
  dispatchWorkflow(
    ref: RepoRef,
    workflowFile: string,
    gitRef: string,
    inputs?: Record<string, string>,
  ): Promise<void>;
  /** Kick a repository_dispatch (e.g. Pagewright-managed dependency update). */
  dispatchRepositoryEvent(
    ref: RepoRef,
    eventType: string,
    clientPayload?: Record<string, unknown>,
  ): Promise<void>;
}

/** Thrown by {@link GitHubProvider.commitFiles} when `expectedHeadSha` no longer matches. */
export class ConcurrencyError extends Error {
  readonly actualHeadSha: string | null;
  constructor(message: string, actualHeadSha: string | null) {
    super(message);
    this.name = "ConcurrencyError";
    this.actualHeadSha = actualHeadSha;
  }
}
