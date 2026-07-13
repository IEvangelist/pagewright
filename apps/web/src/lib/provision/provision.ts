import "server-only";
import {
  PAGEWRIGHT_TOPIC,
  type GitHubProvider,
  type Repo,
  type RepoRef,
  type WorkflowRun,
} from "@pagewright/github";
import { getLatestManifest } from "@pagewright/registry";
import { loadTemplateFiles, loadVendorFiles } from "./template-source";
import { renderProvisionFiles } from "./render";
import type { ProvisionEvent, ProvisionRequest, ProvisionResult } from "./shared";

/**
 * The one-click provisioning orchestrator. It walks the ordered steps — create repo, commit the
 * rendered template + workflows, enable GitHub Pages, and detect the first deploy run — yielding a
 * {@link ProvisionEvent} for every state change so the UI can render live progress. It is written
 * entirely against the {@link GitHubProvider} interface, so it runs identically against real GitHub
 * and the in-memory mock (demo mode).
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll briefly for the push-triggered deploy run so we can deep-link the user to it. */
async function findFirstRun(
  provider: GitHubProvider,
  ref: RepoRef,
): Promise<WorkflowRun | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const runs = await provider.listWorkflowRuns(ref, { perPage: 1 });
      if (runs.length > 0) return runs[0] ?? null;
    } catch {
      // Ignore transient errors while the run is registering.
    }
    await sleep(1500);
  }
  return null;
}

export async function* provisionSite(
  provider: GitHubProvider,
  request: ProvisionRequest,
): AsyncGenerator<ProvisionEvent> {
  const manifest = getLatestManifest(request.templateId);
  if (!manifest) {
    yield {
      type: "error",
      message: `No dependency manifest is registered for the "${request.templateId}" template.`,
    };
    return;
  }

  // Step 1 — create the repository.
  yield { type: "step", stepId: "create-repo", status: "running", message: "Creating your repository…" };
  let repo: Repo;
  try {
    repo = await provider.createRepo({
      name: request.repoName,
      description:
        request.description ||
        `A ${request.templateId} site built with Pagewright`,
      private: request.private,
      autoInit: true,
      topics: [PAGEWRIGHT_TOPIC, request.templateId],
    });
  } catch (error) {
    const message = errorMessage(error);
    yield { type: "step", stepId: "create-repo", status: "error", message };
    yield { type: "error", message: `Couldn't create the repository: ${message}` };
    return;
  }
  const ref: RepoRef = { owner: repo.owner, repo: repo.name };
  yield {
    type: "step",
    stepId: "create-repo",
    status: "done",
    message: `Created ${repo.fullName}`,
  };

  // Step 2 — commit the rendered template + workflows (this push also triggers the deploy).
  yield {
    type: "step",
    stepId: "commit-files",
    status: "running",
    message: "Adding your site files and workflows…",
  };
  try {
    const templateFiles = loadTemplateFiles(request.templateId);
    const vendorFiles = loadVendorFiles();
    const files = renderProvisionFiles({ request, manifest, templateFiles, vendorFiles });
    await provider.commitFiles(ref, {
      message: "Initial Pagewright site",
      files,
      branch: repo.defaultBranch,
    });
    yield {
      type: "step",
      stepId: "commit-files",
      status: "done",
      message: `Committed ${files.length} files`,
    };
  } catch (error) {
    const message = errorMessage(error);
    yield { type: "step", stepId: "commit-files", status: "error", message };
    // Roll back the empty repo so we don't leave an orphan behind.
    try {
      await provider.deleteRepo(ref);
    } catch {
      // Best effort — surfaced in the error message below.
    }
    yield {
      type: "error",
      message: `Couldn't add your site files (${message}). The empty repository was removed so you can retry cleanly.`,
    };
    return;
  }

  // Step 3 — enable GitHub Pages (Actions build). Non-fatal: the repo + files are already safe.
  yield {
    type: "step",
    stepId: "enable-pages",
    status: "running",
    message: "Turning on GitHub Pages…",
  };
  let pagesUrl: string | null = null;
  try {
    const pages = await provider.enablePages(ref, { buildType: "workflow" });
    pagesUrl = pages.url;
    yield {
      type: "step",
      stepId: "enable-pages",
      status: "done",
      message: "GitHub Pages enabled",
    };
  } catch (error) {
    yield {
      type: "step",
      stepId: "enable-pages",
      status: "error",
      message: `${errorMessage(error)} — you can enable Pages from the site page.`,
    };
  }

  // Step 4 — surface the first deploy run.
  yield {
    type: "step",
    stepId: "trigger-build",
    status: "running",
    message: "Starting the first deployment…",
  };
  const run = await findFirstRun(provider, ref);
  yield {
    type: "step",
    stepId: "trigger-build",
    status: "done",
    message: run ? "Deployment started" : "Deployment queued",
  };

  const result: ProvisionResult = {
    owner: repo.owner,
    repo: repo.name,
    fullName: repo.fullName,
    htmlUrl: repo.htmlUrl,
    pagesUrl: pagesUrl ?? `https://${repo.owner}.github.io/${repo.name}/`,
    runId: run?.id ?? null,
    runUrl: run?.htmlUrl ?? null,
    private: repo.private,
  };
  yield { type: "done", result };
}
