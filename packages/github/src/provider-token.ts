import { RestClient, type RestClientOptions, isRecord } from "./rest";
import {
  ConcurrencyError,
  type CommitOptions,
  type CommitResult,
  type CreateRepoOptions,
  type EnablePagesOptions,
  type DirEntry,
  type FileContents,
  type GitHubProvider,
  type GitHubUser,
  type ListWorkflowRunsOptions,
  type PagesInfo,
  type PagesStatusState,
  type ProviderKind,
  type Repo,
  type RepoRef,
  type WorkflowJob,
  type WorkflowRun,
  type WorkflowRunConclusion,
  type WorkflowRunStatus,
} from "./types";

/** Topic Pagewright stamps onto every repo it manages, so the dashboard can find them. */
export const PAGEWRIGHT_TOPIC = "pagewright";

const PAGES_STATE_MAP: Record<string, PagesStatusState> = {
  building: "building",
  built: "built",
  errored: "errored",
};

/**
 * The real, wire-backed provider. It works identically whether the bearer token is an OAuth-App
 * user token or a GitHub-App installation token — GitHub's REST surface is the same — so a single
 * class covers both `kind: "oauth"` and `kind: "app"`.
 */
export class TokenGitHubProvider implements GitHubProvider {
  readonly kind: ProviderKind;
  private readonly rest: RestClient;

  constructor(kind: "oauth" | "app", clientOpts: RestClientOptions) {
    this.kind = kind;
    this.rest = new RestClient(clientOpts);
  }

  get rateLimit() {
    return this.rest.lastRateLimit;
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const raw = await this.rest.request<Record<string, unknown>>("/user");
    return mapUser(raw);
  }

  async listManagedRepos(topic: string = PAGEWRIGHT_TOPIC): Promise<Repo[]> {
    // Search scoped to the authenticated user's repos carrying the topic. Falls back to listing all
    // affiliated repos and filtering client-side when search is unavailable (e.g. some App tokens).
    const user = await this.getAuthenticatedUser();
    try {
      const result = await this.rest.request<{ items?: unknown[] }>("/search/repositories", {
        query: { q: `user:${user.login} topic:${topic} fork:true`, per_page: 100 },
      });
      const items = Array.isArray(result.items) ? result.items : [];
      return items.filter(isRecord).map(mapRepo);
    } catch {
      const repos = await this.rest.paginate<Record<string, unknown>>("/user/repos", {
        query: { affiliation: "owner", sort: "pushed" },
      });
      return repos
        .map(mapRepo)
        .filter((repo) => repo.topics.includes(topic));
    }
  }

  async getRepo(ref: RepoRef): Promise<Repo | null> {
    const raw = await this.rest.request<Record<string, unknown> | null>(
      `/repos/${ref.owner}/${ref.repo}`,
      { allowStatuses: [404] },
    );
    return raw ? mapRepo(raw) : null;
  }

  async createRepo(opts: CreateRepoOptions): Promise<Repo> {
    const raw = await this.rest.request<Record<string, unknown>>("/user/repos", {
      method: "POST",
      body: {
        name: opts.name,
        description: opts.description,
        private: opts.private ?? true,
        auto_init: opts.autoInit ?? true,
        homepage: opts.homepage,
        has_issues: true,
        has_wiki: false,
        has_projects: false,
      },
    });
    const repo = mapRepo(raw);
    const topics = opts.topics ?? [];
    if (!topics.includes(PAGEWRIGHT_TOPIC)) topics.push(PAGEWRIGHT_TOPIC);
    await this.setTopics({ owner: repo.owner, repo: repo.name }, topics);
    repo.topics = topics;
    return repo;
  }

  async deleteRepo(ref: RepoRef): Promise<void> {
    await this.rest.request(`/repos/${ref.owner}/${ref.repo}`, { method: "DELETE" });
  }

  private async setTopics(ref: RepoRef, topics: string[]): Promise<void> {
    await this.rest.request(`/repos/${ref.owner}/${ref.repo}/topics`, {
      method: "PUT",
      headers: { accept: "application/vnd.github+json" },
      body: { names: topics.map((t) => t.toLowerCase()) },
    });
  }

  async getBranchHead(ref: RepoRef, branch?: string): Promise<string | null> {
    const b = branch ?? (await this.requireDefaultBranch(ref));
    const data = await this.rest.request<{ object?: { sha?: string } } | null>(
      `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(b)}`,
      { allowStatuses: [404, 409] },
    );
    return data?.object?.sha ?? null;
  }

  async getFile(ref: RepoRef, path: string, branch?: string): Promise<FileContents | null> {
    const data = await this.rest.request<Record<string, unknown> | null>(
      `/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}`,
      { query: branch ? { ref: branch } : undefined, allowStatuses: [404] },
    );
    if (!data || typeof data.content !== "string" || typeof data.sha !== "string") return null;
    const encoding = typeof data.encoding === "string" ? data.encoding : "base64";
    const decoded = encoding === "base64" ? decodeBase64(data.content) : data.content;
    return { content: decoded, sha: data.sha, path };
  }

  async listDirectory(ref: RepoRef, path: string, branch?: string): Promise<DirEntry[]> {
    // The contents API returns a JSON array when `path` is a directory (names + shas, not content),
    // and 404s when the directory does not exist — which we tolerate as an empty listing.
    const data = await this.rest.request<unknown>(
      `/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}`,
      { query: branch ? { ref: branch } : undefined, allowStatuses: [404] },
    );
    if (!Array.isArray(data)) return [];
    return data.filter(isRecord).map((entry) => ({
      name: typeof entry.name === "string" ? entry.name : "",
      path: typeof entry.path === "string" ? entry.path : "",
      type: entry.type === "dir" ? "dir" : "file",
      sha: typeof entry.sha === "string" ? entry.sha : "",
    }));
  }

  /**
   * Atomic multi-file commit through the Git Data API: create blobs, assemble a tree on top of the
   * current commit's tree, create the commit, then fast-forward the branch ref. Optionally guarded
   * by `expectedHeadSha` so a stale save fails loudly instead of clobbering remote edits.
   */
  async commitFiles(ref: RepoRef, opts: CommitOptions): Promise<CommitResult> {
    const branch = opts.branch ?? (await this.requireDefaultBranch(ref));
    const base = `/repos/${ref.owner}/${ref.repo}`;

    const headSha = await this.getBranchHead(ref, branch);
    if (!headSha) {
      throw new Error(`Branch "${branch}" not found in ${ref.owner}/${ref.repo}`);
    }
    if (opts.expectedHeadSha && opts.expectedHeadSha !== headSha) {
      throw new ConcurrencyError(
        `Branch "${branch}" moved from ${opts.expectedHeadSha} to ${headSha}`,
        headSha,
      );
    }

    const baseCommit = await this.rest.request<{ tree: { sha: string } }>(
      `${base}/git/commits/${headSha}`,
    );

    const treeItems: Array<Record<string, unknown>> = [];
    for (const file of opts.files) {
      const isBase64 = file.encoding === "base64";
      const blob = await this.rest.request<{ sha: string }>(`${base}/git/blobs`, {
        method: "POST",
        body: { content: file.content, encoding: isBase64 ? "base64" : "utf-8" },
      });
      treeItems.push({ path: normalizePath(file.path), mode: "100644", type: "blob", sha: blob.sha });
    }
    for (const del of opts.deletions ?? []) {
      // A null sha in a tree entry deletes the path.
      treeItems.push({ path: normalizePath(del), mode: "100644", type: "blob", sha: null });
    }

    const tree = await this.rest.request<{ sha: string }>(`${base}/git/trees`, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree: treeItems },
    });

    const commit = await this.rest.request<{ sha: string; html_url?: string }>(`${base}/git/commits`, {
      method: "POST",
      body: { message: opts.message, tree: tree.sha, parents: [headSha] },
    });

    try {
      await this.rest.request(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: { sha: commit.sha, force: false },
      });
    } catch (err) {
      // A non-fast-forward update means someone committed between our read and write.
      const actual = await this.getBranchHead(ref, branch);
      throw new ConcurrencyError(
        `Failed to update ${branch}; it may have moved. ${(err as Error).message}`,
        actual,
      );
    }

    return {
      sha: commit.sha,
      htmlUrl: commit.html_url ?? `https://github.com/${ref.owner}/${ref.repo}/commit/${commit.sha}`,
      branch,
    };
  }

  async enablePages(ref: RepoRef, opts: EnablePagesOptions = {}): Promise<PagesInfo> {
    const buildType = opts.buildType ?? "workflow";
    const body: Record<string, unknown> = { build_type: buildType };
    if (buildType === "legacy") {
      body.source = { branch: opts.branch ?? "main", path: opts.path ?? "/" };
    }
    // POST creates; if Pages already exists GitHub returns 409 — treat as "already enabled".
    const created = await this.rest.request<Record<string, unknown> | null>(
      `/repos/${ref.owner}/${ref.repo}/pages`,
      { method: "POST", body, allowStatuses: [409] },
    );
    if (created === null) {
      // Ensure the build_type is what we want, then read current state.
      await this.rest.request(`/repos/${ref.owner}/${ref.repo}/pages`, {
        method: "PUT",
        body: { build_type: buildType },
        allowStatuses: [400],
      });
    }
    return this.getPages(ref);
  }

  async getPages(ref: RepoRef): Promise<PagesInfo> {
    const data = await this.rest.request<Record<string, unknown> | null>(
      `/repos/${ref.owner}/${ref.repo}/pages`,
      { allowStatuses: [404] },
    );
    if (!data) {
      return { enabled: false, url: null, status: "not_enabled", cname: null };
    }
    const statusRaw = typeof data.status === "string" ? data.status : "";
    return {
      enabled: true,
      url: typeof data.html_url === "string" ? data.html_url : null,
      status: PAGES_STATE_MAP[statusRaw] ?? "unknown",
      cname: typeof data.cname === "string" ? data.cname : null,
    };
  }

  async disablePages(ref: RepoRef): Promise<void> {
    await this.rest.request(`/repos/${ref.owner}/${ref.repo}/pages`, {
      method: "DELETE",
      allowStatuses: [404],
    });
  }

  async listWorkflowRuns(ref: RepoRef, opts: ListWorkflowRunsOptions = {}): Promise<WorkflowRun[]> {
    const data = await this.rest.request<{ workflow_runs?: unknown[] }>(
      `/repos/${ref.owner}/${ref.repo}/actions/runs`,
      {
        query: {
          branch: opts.branch,
          event: opts.event,
          per_page: opts.perPage ?? 20,
        },
      },
    );
    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    return runs.filter(isRecord).map(mapWorkflowRun);
  }

  async getWorkflowRun(ref: RepoRef, runId: number): Promise<WorkflowRun | null> {
    const data = await this.rest.request<Record<string, unknown> | null>(
      `/repos/${ref.owner}/${ref.repo}/actions/runs/${runId}`,
      { allowStatuses: [404] },
    );
    return data ? mapWorkflowRun(data) : null;
  }

  async listWorkflowJobs(ref: RepoRef, runId: number): Promise<WorkflowJob[]> {
    const data = await this.rest.request<{ jobs?: unknown[] }>(
      `/repos/${ref.owner}/${ref.repo}/actions/runs/${runId}/jobs`,
    );
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    return jobs.filter(isRecord).map(mapWorkflowJob);
  }

  async dispatchWorkflow(
    ref: RepoRef,
    workflowFile: string,
    gitRef: string,
    inputs?: Record<string, string>,
  ): Promise<void> {
    await this.rest.request(
      `/repos/${ref.owner}/${ref.repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
      { method: "POST", body: { ref: gitRef, inputs } },
    );
  }

  async dispatchRepositoryEvent(
    ref: RepoRef,
    eventType: string,
    clientPayload?: Record<string, unknown>,
  ): Promise<void> {
    await this.rest.request(`/repos/${ref.owner}/${ref.repo}/dispatches`, {
      method: "POST",
      body: { event_type: eventType, client_payload: clientPayload ?? {} },
    });
  }

  private async requireDefaultBranch(ref: RepoRef): Promise<string> {
    const repo = await this.getRepo(ref);
    if (!repo) throw new Error(`Repo ${ref.owner}/${ref.repo} not found`);
    return repo.defaultBranch;
  }
}

function mapUser(raw: Record<string, unknown>): GitHubUser {
  return {
    id: Number(raw.id),
    login: String(raw.login),
    name: typeof raw.name === "string" ? raw.name : null,
    avatarUrl: typeof raw.avatar_url === "string" ? raw.avatar_url : "",
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : "",
  };
}

function mapRepo(raw: Record<string, unknown>): Repo {
  const owner = isRecord(raw.owner) && typeof raw.owner.login === "string" ? raw.owner.login : "";
  const hasPages = raw.has_pages === true;
  const homepage = typeof raw.homepage === "string" && raw.homepage ? raw.homepage : null;
  return {
    id: Number(raw.id),
    name: String(raw.name),
    fullName: typeof raw.full_name === "string" ? raw.full_name : `${owner}/${String(raw.name)}`,
    owner,
    private: raw.private === true,
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : "",
    defaultBranch: typeof raw.default_branch === "string" ? raw.default_branch : "main",
    description: typeof raw.description === "string" ? raw.description : null,
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t): t is string => typeof t === "string") : [],
    homepage,
    pushedAt: typeof raw.pushed_at === "string" ? raw.pushed_at : null,
    pagesUrl: hasPages ? homepage ?? derivePagesUrl(owner, String(raw.name)) : null,
  };
}

function derivePagesUrl(owner: string, repo: string): string {
  return `https://${owner}.github.io/${repo}/`;
}

function mapWorkflowRun(raw: Record<string, unknown>): WorkflowRun {
  return {
    id: Number(raw.id),
    name: typeof raw.name === "string" ? raw.name : null,
    status: (typeof raw.status === "string" ? raw.status : "unknown") as WorkflowRunStatus,
    conclusion: (raw.conclusion ?? null) as WorkflowRunConclusion,
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : "",
    headBranch: typeof raw.head_branch === "string" ? raw.head_branch : null,
    headSha: typeof raw.head_sha === "string" ? raw.head_sha : "",
    event: typeof raw.event === "string" ? raw.event : "",
    createdAt: typeof raw.created_at === "string" ? raw.created_at : "",
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : "",
    runNumber: Number(raw.run_number ?? 0),
  };
}

function mapWorkflowJob(raw: Record<string, unknown>): WorkflowJob {
  const steps = Array.isArray(raw.steps) ? raw.steps.filter(isRecord) : [];
  return {
    id: Number(raw.id),
    name: typeof raw.name === "string" ? raw.name : "",
    status: (typeof raw.status === "string" ? raw.status : "unknown") as WorkflowRunStatus,
    conclusion: (raw.conclusion ?? null) as WorkflowRunConclusion,
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : null,
    steps: steps.map((step) => ({
      name: typeof step.name === "string" ? step.name : "",
      status: (typeof step.status === "string" ? step.status : "unknown") as WorkflowRunStatus,
      conclusion: (step.conclusion ?? null) as WorkflowRunConclusion,
      number: Number(step.number ?? 0),
    })),
  };
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function encodePath(path: string): string {
  return normalizePath(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeBase64(content: string): string {
  const cleaned = content.replace(/\n/g, "");
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(cleaned, "base64").toString("utf-8");
  }
  // Browser/edge fallback.
  return decodeURIComponent(escape(atob(cleaned)));
}
