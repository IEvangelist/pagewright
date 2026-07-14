/**
 * A fully in-memory {@link GitHubProvider}. It lets the entire builder — sign-in, dashboard,
 * provisioning, commits, publish/unpublish, and the deploy-progress view — run and be demoed with
 * zero GitHub credentials. Workflow runs advance on a wall-clock timeline so the deploy-progress UX
 * can be exercised end-to-end. State lives in a process-level store, so it persists across requests
 * within a single dev server but is intentionally ephemeral (no external side effects).
 */

import {
  type Base64FileContents,
  ConcurrencyError,
  type CommitOptions,
  type CommitResult,
  type CreateRepoOptions,
  type DiscussionSetup,
  type DirEntry,
  type EnablePagesOptions,
  type FileContents,
  type GitHubProvider,
  type GitHubUser,
  type ListWorkflowRunsOptions,
  type PagesInfo,
  type PullRequestFilesOptions,
  type PullRequestResult,
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

const mockGlobal = globalThis as typeof globalThis & {
  __pagewrightMockStores?: Map<string, MockStore>;
};
const stores = (mockGlobal.__pagewrightMockStores ??= new Map<string, MockStore>());

/** Deploy-progress timeline: how long the simulated Actions run takes to reach "built". */
const RUN_DURATION_MS = 45_000;

/**
 * A realistic page document seeded into every mock repo so the visual editor is demoable without a
 * live GitHub backend. Mirrors the landing template's `home.json` shape (navbar → hero → features →
 * cta → footer) and personalizes the brand/heading from the repo name.
 */
function seedHomePage(name: string): string {
  const brand = name
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const page = {
    title: `${brand} — built with Pagewright`,
    description: `The ${brand} site, customized visually and deployed to GitHub Pages.`,
    slug: "/",
    draft: false,
    blocks: [
      {
        type: "navbar",
        id: "nav-1",
        props: {
          brand: "{{site.name}}",
          links: [
            { label: "Features", href: "#features" },
            { label: "About", href: "#about" },
          ],
          cta: { label: "Get started", href: "#start" },
        },
      },
      {
        type: "hero",
        id: "hero-1",
        props: {
          eyebrow: "Powered by GitHub Pages",
          heading: "Welcome to {{site.name}}",
          subheading:
            "Edit every block right here in the visual builder, then publish straight to your own GitHub repository.",
          primaryCta: { label: "Start building", href: "#start" },
          secondaryCta: { label: "Learn more", href: "#about" },
          align: "center",
        },
      },
      {
        type: "features",
        id: "features-1",
        props: {
          heading: "Everything you need to go live",
          columns: 3,
          items: [
            { icon: "palette", title: "Visual builder", body: "Drag, drop, and edit with a live preview." },
            { icon: "rocket", title: "One-click publish", body: "Provisions a repo that deploys itself." },
            { icon: "shield", title: "GitHub auth only", body: "Acts on your behalf with scoped permissions." },
          ],
        },
      },
      {
        type: "cta",
        id: "cta-1",
        props: {
          heading: "Your next site is one click away",
          body: "Sign in with GitHub and publish your first page today.",
          primaryCta: { label: "Get started free", href: "#start" },
        },
      },
      {
        type: "footer",
        id: "footer-1",
        props: {
          brand: "{{site.name}}",
          tagline: "No-code sites, powered by your GitHub.",
          links: [],
          copyright: "© {{currentYear}} {{site.name}}",
        },
      },
    ],
  };
  return JSON.stringify(page, null, 2);
}

function seedSiteConfig(repo: Repo): string {
  return JSON.stringify(
    {
      name: repo.name
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      description: repo.description ?? "",
      url: repo.homepage ?? "",
      defaultTheme: "system",
      links: [
        {
          label: "GitHub repository",
          href: repo.htmlUrl,
          icon: "github",
        },
      ],
    },
    null,
    2,
  );
}

function keyFor(login: string): string {
  return login.toLowerCase();
}

/**
 * A few sample blog posts (published, scheduled, and draft) seeded into mock blog repos so the Posts
 * authoring experience — list, status badges, edit, and delete — is demoable without a live backend.
 */
function seedBlogPosts(): Array<[string, string]> {
  const prose = (heading: string, body: string) => ({
    type: "prose",
    id: `prose-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    props: { markdown: `## ${heading}\n\n${body}` },
  });
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const day = 86_400_000;
  const posts: Array<{ slug: string; doc: Record<string, unknown> }> = [
    {
      slug: "hello-world",
      doc: {
        title: "Hello, world",
        description: "The first post on my brand-new Pagewright blog.",
        slug: "hello-world",
        draft: false,
        date: iso(3 * day),
        excerpt: "Kicking things off — why I started this blog and what to expect.",
        tags: ["intro", "meta"],
        author: "Pagewright Demo",
        blocks: [
          prose(
            "Welcome",
            "This blog was created and published straight from Pagewright — no terminal required. Every post you see here is a JSON document committed to a GitHub repo that deploys itself to GitHub Pages.",
          ),
        ],
      },
    },
    {
      slug: "designing-in-the-open",
      doc: {
        title: "Designing in the open",
        description: "Notes on building a portfolio the transparent way.",
        slug: "designing-in-the-open",
        draft: false,
        date: iso(1 * day),
        excerpt: "A short field guide to sharing work-in-progress without the anxiety.",
        tags: ["design", "process"],
        author: "Pagewright Demo",
        blocks: [
          prose(
            "Why open",
            "Publishing early keeps me honest and invites feedback while it still matters. Here's how I structure posts so they stay useful months later.",
          ),
        ],
      },
    },
    {
      slug: "coming-soon-roadmap",
      doc: {
        title: "Coming soon: the 2026 roadmap",
        description: "A scheduled peek at what's next.",
        slug: "coming-soon-roadmap",
        draft: false,
        date: iso(-2 * day),
        publishAt: iso(-2 * day),
        excerpt: "Scheduled to go live in two days — a preview of the roadmap.",
        tags: ["roadmap"],
        author: "Pagewright Demo",
        blocks: [prose("What's next", "This post is scheduled — it will appear on the live site once its publish date arrives.")],
      },
    },
    {
      slug: "untitled-draft",
      doc: {
        title: "Untitled draft",
        description: "",
        slug: "untitled-draft",
        draft: true,
        date: iso(0),
        excerpt: "",
        tags: [],
        author: "Pagewright Demo",
        blocks: [prose("Rough notes", "Still cooking. This one is a draft, so it stays hidden from the published site until I flip the switch.")],
      },
    },
  ];
  return posts.map((p) => [
    `src/data/posts/${p.slug}.json`,
    JSON.stringify(p.doc, null, 2),
  ]);
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
    nodeId: `R_mockRepository${id}`,
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
    hasDiscussions: opts.template === "blog",
    pagesUrl: `https://${login}.github.io/${opts.name}/`,
  };
  const state: MockRepoState = {
    repo,
    branchHead: sha,
    files: new Map<string, string>([
      [
        "pagewright.json",
        JSON.stringify(
          {
            templateId: opts.template,
            manifestVersion: "2026.7.1",
            schemaVersion: "2",
            channel: "stable",
            createdWith: "0.1.0",
            updatedAt: "2026-07-14",
          },
          null,
          2,
        ),
      ],
      ["vendor/pagewright-blocks/src/bindings.ts", "// Global features runtime marker.\n"],
      [
        "package.json",
        JSON.stringify(
          {
            name: opts.name,
            private: true,
            type: "module",
            dependencies: {
              "@pagewright/blocks": "file:./vendor/pagewright-blocks",
              "@pagewright/site-kit": "file:./vendor/pagewright-site-kit",
            },
          },
          null,
          2,
        ),
      ],
      ["src/data/site.json", seedSiteConfig(repo)],
      ["src/data/pages/home.json", seedHomePage(opts.name)],
      ...(opts.template === "blog" ? seedBlogPosts() : []),
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

  async getDiscussionSetup(ref: RepoRef): Promise<DiscussionSetup | null> {
    const repo = await this.getRepo(ref);
    if (!repo) return null;
    return {
      repo: repo.fullName,
      repoId: repo.nodeId,
      enabled: repo.hasDiscussions,
      private: repo.private,
      categories: repo.hasDiscussions
        ? [
            {
              id: `DIC_mockAnnouncements${repo.id}`,
              name: "Announcements",
              description: "Updates and post conversations",
              emoji: "📣",
            },
            {
              id: `DIC_mockGeneral${repo.id}`,
              name: "General",
              description: "Open discussion",
              emoji: "💬",
            },
          ]
        : [],
    };
  }

  async enableDiscussions(ref: RepoRef): Promise<DiscussionSetup> {
    const repo = requireRepo(this.store(), ref).repo;
    repo.hasDiscussions = true;
    return (await this.getDiscussionSetup(ref))!;
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

  async getFileBase64(ref: RepoRef, path: string): Promise<Base64FileContents | null> {
    const state = this.store().repos.get(ref.repo.toLowerCase());
    const contentBase64 = state?.files.get(path);
    if (state === undefined || contentBase64 === undefined) return null;
    return { contentBase64, sha: randomSha(), path };
  }

  async listDirectory(ref: RepoRef, path: string): Promise<DirEntry[]> {
    const state = this.store().repos.get(ref.repo.toLowerCase());
    if (!state) return [];
    const prefix = path.replace(/\/+$/, "") + "/";
    const seen = new Set<string>();
    const entries: DirEntry[] = [];
    for (const filePath of state.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        entries.push({ name: rest, path: filePath, type: "file", sha: randomSha() });
      } else {
        // A nested path implies an intermediate directory entry.
        const dirName = rest.slice(0, slash);
        if (!seen.has(dirName)) {
          seen.add(dirName);
          entries.push({ name: dirName, path: prefix + dirName, type: "dir", sha: randomSha() });
        }
      }
    }
    return entries;
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

  async createPullRequestWithFiles(
    ref: RepoRef,
    opts: PullRequestFilesOptions,
  ): Promise<PullRequestResult> {
    const store = this.store();
    const state = requireRepo(store, ref);
    if (opts.baseSha !== state.branchHead) {
      throw new ConcurrencyError("Branch moved", state.branchHead);
    }
    const number = store.nextId++;
    return {
      number,
      htmlUrl: `https://github.com/${ref.owner}/${ref.repo}/pull/${number}`,
      branch: opts.branch,
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
