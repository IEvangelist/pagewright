import "server-only";

import type { GitHubProvider, RepoRef } from "@pagewright/github";
import { buildDeployStatus, type DeployStatus } from "./status";

/**
 * Capture a live deploy snapshot for a repo through the provider. Used by both the manage page
 * (initial server render, so the view is correct on reload) and the polling route handler.
 *
 * Individual GitHub calls are made resilient: Pages/runs/jobs failures degrade to empty rather
 * than failing the whole snapshot, so a transient hiccup never blanks the progress view.
 */
export async function getDeployStatus(
  provider: GitHubProvider,
  ref: RepoRef,
): Promise<DeployStatus | null> {
  const repo = await provider.getRepo(ref);
  if (!repo) return null;

  const [pages, runs, branchHeadSha] = await Promise.all([
    provider.getPages(ref).catch(() => null),
    provider
      .listWorkflowRuns(ref, {
        branch: repo.defaultBranch,
        perPage: 1,
        workflowFile: "deploy.yml",
      })
      .catch(() => []),
    provider.getBranchHead(ref, repo.defaultBranch).catch(() => null),
  ]);

  const run = runs[0] ?? null;
  const jobs = run ? await provider.listWorkflowJobs(ref, run.id).catch(() => []) : [];

  return buildDeployStatus({ owner: ref.owner, repo, pages, run, jobs, branchHeadSha });
}
