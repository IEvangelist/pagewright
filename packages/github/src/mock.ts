/**
 * A fully in-memory {@link GitHubProvider}. It lets the entire builder — sign-in, dashboard,
 * provisioning, commits, publish/unpublish, and the deploy-progress view — run and be demoed with
 * zero GitHub credentials. Workflow runs advance on a wall-clock timeline so the deploy-progress UX
 * can be exercised end-to-end. State lives in a process-level store, so it persists across requests
 * within a single dev server but is intentionally ephemeral (no external side effects).
 */

import {
  ConcurrencyError,
  type CommitOptions,
  type CommitResult,
  type CreateRepoOptions,
  type EnablePagesOptions,
  type FileContents,
  type GitHubProvider,
  type GitHubUser,
  type ListWorkflowRunsOptions,
  type PagesInfo,
  type Repo,
  type RepoRef,
  type WorkflowJob,
  type WorkflowRun,
} from "./types";
import { PAGEWRIGHT_TOPIC } from "./provider-token";

interface MockRepoState {
  repo: Repo;
  branchHead: string;
  files: Map<string, string>;
  pages: PagesInfo;
  runs: MockRun[];
}

interface MockRun {
  id: number;
  runNumber: number;
  event: string;
  createdAtMs: number;
  headSha: string;
  htmlUrl: string;
}

interface MockStore {
  user: GitHubUser;
  repos: Map<string, MockRepoState>;
  nextId: number;
}

const stores = new Map<string, MockStore>();

/** Deploy-progress timeline: how long the simulated Actions run takes to reach "built". */
const RUN_DURATION_MS = 45_000;

function keyFor(login: string): string {
  return login.toLowerCase();
}

function randomSha(): string {
  return Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

function getStore(login: string): MockStore {
  const key = keyFor(login);
  let store = stores.get(key);
  if (!store) {
    store = seedStore(login);
    stores.set(key, store);
  }
  return store;
}

function seedStore(login: string): MockStore {
  const user: GitHubUser = {
    id: 424242,
    login,
    name: "Pagewright Demo",
    avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(login)}`,
    htmlUrl: `https://github.com/${login}`,
  };
  const store: MockStore = { user, repos: new Map(), nextId: 1001 };

  // Two pre-existing "managed" sites so the dashboard isn't empty on first run.
  seedRepo(store, login, {
    name: "my-blog",
    description: "Personal blog built with Pagewright",
    topics: ["blog"],
    template: "blog",
    minutesAgo: 60 * 6,
  });
  seedRepo(store, login, {
    name: "portfolio",
    description: "Design portfolio",
    topics: ["portfolio"],
    template: "portfolio",
    minutesAgo: 60 * 30,
  });
  return store;
}

function seedRepo(
  store: MockStore,
  login: string,
  opts: { name: string; description: string; topics: string[]; template: string; minutesAgo: number },
): MockRepoState {
  const id = store.nextId++;
  const sha = randomSha();
  const pushedAt = new Date(Date.now() - opts.minutesAgo * 60_000).toISOString();
  const repo: Repo = {
    id,
    name: opts.name,
    fullName: `${login}/${opts.name}`,
    owner: login,
    private: false,
    htmlUrl: `https://github.com/${login}/${opts.name}`,
    defaultBranch: "main",
    description: opts.description,
    topics: [...opts.topics, PAGEWRIGHT_TOPIC],
    homepage: `https://${login}.github.io/${opts.name}/`,
    pushedAt,
    pagesUrl: `https://${login}.github.io/${opts.name}/`,
  };
  const state: MockRepoState = {
    repo,
    branchHead: sha,
    files: new Map([
      ["pagewright.json", JSON.stringify({ templateId: opts.template, manifestVersion: "2026.7.0" }, null, 2)],
    ]),
    pages: { enabled: true, url: repo.pagesUrl, status: "built", cname: null },
    runs: [
      {
        id: store.nextId++,
        runNumber: 7,
        event: "push",
        createdAtMs: Date.now() - opts.minutesAgo * 60_000,
        headSha: sha,
        htmlUrl: `https://github.com/${login}/${opts.name}/actions/runs/${id}`,
      },
    ],
  };
  store.repos.set(opts.name.toLowerCase(), state);
  return state;
}

function requireRepo(store: MockStore, ref: RepoRef): MockRepoState {
  const state = store.repos.get(ref.repo.toLowerCase());
  if (!state) throw new Error(`Repo ${ref.owner}/${ref.repo} not found`);
  return state;
}

function runToWorkflowRun(run: MockRun): WorkflowRun {
  const elapsed = Date.now() - run.createdAtMs;
  const status = elapsed >= RUN_DURATION_MS ? "completed" : "in_progress";
  const conclusion = status === "completed" ? "success" : null;
  return {
    id: run.id,
    name: "Deploy to GitHub Pages",
    status,
    conclusion,
    htmlUrl: run.htmlUrl,
    headBranch: "main",
    headSha: run.headSha,
    event: run.event,
    createdAt: new Date(run.createdAtMs).toISOString(),
    updatedAt: new Date(Math.min(Date.now(), run.createdAtMs + RUN_DURATION_MS)).toISOString(),
    runNumber: run.runNumber,
  };
}

export class MockGitHubProvider implements GitHubProvider {
  readonly kind = "mock" as const;
  private readonly login: string;

  constructor(login: string = "octocat") {
    this.login = login;
  }

  private store(): MockStore {
    return getStore(this.login);
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.store().user;
  }

  async listManagedRepos(topic: string = PAGEWRIGHT_TOPIC): Promise<Repo[]> {
    return [...this.store().repos.values()]
      .map((s) => s.repo)
      .filter((r) => r.topics.includes(topic))
      .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
  }

  async getRepo(ref: RepoRef): Promise<Repo | null> {
    return this.store().repos.get(ref.repo.toLowerCase())?.repo ?? null;
  }

  async createRepo(opts: CreateRepoOptions): Promise<Repo> {
    const store = this.store();
    if (store.repos.get(opts.name.toLowerCase())) {
      throw new Error(`Repository ${opts.name} already exists`);
    }
    const state = seedRepo(store, this.login, {
      name: opts.name,
      description: opts.description ?? "",
      topics: (opts.topics ?? []).filter((t) => t !== PAGEWRIGHT_TOPIC),
      template: "landing",
      minutesAgo: 0,
    });
    // A freshly created repo starts with Pages not yet enabled and no runs.
    state.pages = { enabled: false, url: null, status: "not_enabled", cname: null };
    state.runs = [];
    state.repo.pagesUrl = null;
    state.repo.homepage = opts.homepage ?? null;
    return state.repo;
  }

  async deleteRepo(ref: RepoRef): Promise<void> {
    this.store().repos.delete(ref.repo.toLowerCase());
  }

  async getBranchHead(ref: RepoRef): Promise<string | null> {
    return this.store().repos.get(ref.repo.toLowerCase())?.branchHead ?? null;
  }

  async getFile(ref: RepoRef, path: string): Promise<FileContents | null> {
    const state = this.store().repos.get(ref.repo.toLowerCase());
    const content = state?.files.get(path);
    if (state === undefined || content === undefined) return null;
    return { content, sha: randomSha(), path };
  }

  async commitFiles(ref: RepoRef, opts: CommitOptions): Promise<CommitResult> {
    const store = this.store();
    const state = requireRepo(store, ref);
    if (opts.expectedHeadSha && opts.expectedHeadSha !== state.branchHead) {
      throw new ConcurrencyError("Branch moved", state.branchHead);
    }
    for (const file of opts.files) state.files.set(file.path, file.content);
    for (const del of opts.deletions ?? []) state.files.delete(del);
    const sha = randomSha();
    state.branchHead = sha;
    state.repo.pushedAt = new Date().toISOString();
    // Every commit triggers a fresh deploy run (mirrors the real push → deploy.yml flow).
    state.runs.unshift({
      id: store.nextId++,
      runNumber: (state.runs[0]?.runNumber ?? 0) + 1,
      event: "push",
      createdAtMs: Date.now(),
      headSha: sha,
      htmlUrl: `https://github.com/${ref.owner}/${ref.repo}/actions/runs/${store.nextId}`,
    });
    return {
      sha,
      htmlUrl: `https://github.com/${ref.owner}/${ref.repo}/commit/${sha}`,
      branch: opts.branch ?? "main",
    };
  }

  async enablePages(ref: RepoRef, _opts?: EnablePagesOptions): Promise<PagesInfo> {
    const state = requireRepo(this.store(), ref);
    const url = `https://${ref.owner}.github.io/${ref.repo}/`;
    state.pages = { enabled: true, url, status: "building", cname: null };
    state.repo.pagesUrl = url;
    state.repo.homepage = url;
    return state.pages;
  }

  async getPages(ref: RepoRef): Promise<PagesInfo> {
    const state = this.store().repos.get(ref.repo.toLowerCase());
    if (!state) return { enabled: false, url: null, status: "not_enabled", cname: null };
    // Promote building → built once the latest run has "finished".
    if (state.pages.enabled && state.pages.status === "building") {
      const latest = state.runs[0];
      if (latest && Date.now() - latest.createdAtMs >= RUN_DURATION_MS) {
        state.pages = { ...state.pages, status: "built" };
      }
    }
    return state.pages;
  }

  async disablePages(ref: RepoRef): Promise<void> {
    const state = this.store().repos.get(ref.repo.toLowerCase());
    if (state) {
      state.pages = { enabled: false, url: null, status: "not_enabled", cname: null };
      state.repo.pagesUrl = null;
    }
  }

  async listWorkflowRuns(ref: RepoRef, opts?: ListWorkflowRunsOptions): Promise<WorkflowRun[]> {
    const state = requireRepo(this.store(), ref);
    const runs = state.runs.map(runToWorkflowRun);
    return typeof opts?.perPage === "number" ? runs.slice(0, opts.perPage) : runs;
  }

  async getWorkflowRun(ref: RepoRef, runId: number): Promise<WorkflowRun | null> {
    const state = requireRepo(this.store(), ref);
    const run = state.runs.find((r) => r.id === runId);
    return run ? runToWorkflowRun(run) : null;
  }

  async listWorkflowJobs(ref: RepoRef, runId: number): Promise<WorkflowJob[]> {
    const state = requireRepo(this.store(), ref);
    const run = state.runs.find((r) => r.id === runId);
    if (!run) return [];
    const wf = runToWorkflowRun(run);
    const done = wf.status === "completed";
    const mkStep = (name: string, index: number, threshold: number) => {
      const elapsed = Date.now() - run.createdAtMs;
      const status = elapsed >= threshold ? "completed" : elapsed >= threshold - 12_000 ? "in_progress" : "queued";
      return {
        name,
        status: status as WorkflowJob["steps"][number]["status"],
        conclusion: (status === "completed" ? "success" : null) as WorkflowJob["steps"][number]["conclusion"],
        number: index,
      };
    };
    return [
      {
        id: run.id,
        name: "build-and-deploy",
        status: wf.status,
        conclusion: wf.conclusion,
        htmlUrl: run.htmlUrl,
        steps: [
          mkStep("Checkout", 1, 8_000),
          mkStep("Install dependencies", 2, 20_000),
          mkStep("Build Astro site", 3, 33_000),
          mkStep("Upload Pages artifact", 4, 40_000),
          mkStep("Deploy to GitHub Pages", 5, RUN_DURATION_MS),
        ],
      },
    ].map((job) => (done ? job : job));
  }

  async dispatchWorkflow(ref: RepoRef): Promise<void> {
    // Simulate "publish now" kicking a fresh run.
    await this.commitFiles(ref, { message: "Manual publish", files: [] });
  }

  async dispatchRepositoryEvent(): Promise<void> {
    // No-op in mock mode; real provider opens a managed-update PR.
  }
}
