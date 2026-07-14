import Link from "next/link";
import {
  ArrowUpRight,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Rocket,
} from "lucide-react";
import {
  PageRenderer,
  parsePage,
  parseSiteConfig,
  type Block,
  type SiteConfig,
} from "@pagewright/blocks";
import type { GitHubProvider, PagesInfo, Repo, WorkflowRun } from "@pagewright/github";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { GitHubMark } from "@/components/icons/github-mark";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthMode } from "@/lib/auth/env";
import { HOME_PAGE_PATH } from "@/lib/publish/state";

export const dynamic = "force-dynamic";

interface SiteView {
  repo: Repo;
  pages: PagesInfo;
  latestRun: WorkflowRun | null;
  /** The site's home page blocks, used to render a live thumbnail preview. */
  previewBlocks: Block[] | null;
  siteConfig: SiteConfig;
}

async function loadSites(provider: GitHubProvider): Promise<SiteView[]> {
  const repos = await provider.listManagedRepos();
  // Enrich each site with Pages + latest run + a preview in parallel; tolerate per-repo failures.
  return Promise.all(
    repos.map(async (repo): Promise<SiteView> => {
      const ref = { owner: repo.owner, repo: repo.name };
      const [pages, runs, home, siteFile] = await Promise.all([
        provider.getPages(ref).catch(() => emptyPages()),
        provider.listWorkflowRuns(ref, { perPage: 1 }).catch(() => []),
        provider.getFile(ref, HOME_PAGE_PATH).catch(() => null),
        provider.getFile(ref, "src/data/site.json").catch(() => null),
      ]);
      let previewBlocks: Block[] | null = null;
      if (home) {
        try {
          previewBlocks = parsePage(JSON.parse(home.content)).blocks;
        } catch {
          previewBlocks = null;
        }
      }
      let siteConfig: SiteConfig;
      try {
        siteConfig = parseSiteConfig(
          siteFile
            ? JSON.parse(siteFile.content)
            : { name: repo.name, description: repo.description ?? "", url: repo.homepage ?? "" },
        );
      } catch {
        siteConfig = parseSiteConfig({ name: repo.name, description: repo.description ?? "" });
      }
      return { repo, pages, latestRun: runs[0] ?? null, previewBlocks, siteConfig };
    }),
  );
}

function emptyPages(): PagesInfo {
  return { enabled: false, url: null, status: "not_enabled", cname: null };
}

type StatusTone = "live" | "deploying" | "error" | "idle";

function deriveStatus(site: SiteView): { tone: StatusTone; label: string } {
  if (site.latestRun && site.latestRun.status !== "completed") {
    return { tone: "deploying", label: "Deploying" };
  }
  if (site.latestRun?.conclusion === "failure" || site.pages.status === "errored") {
    return { tone: "error", label: "Build failed" };
  }
  if (site.pages.status === "built" && site.pages.enabled) {
    return { tone: "live", label: "Live" };
  }
  if (site.pages.status === "building") {
    return { tone: "deploying", label: "Deploying" };
  }
  return { tone: "idle", label: "Not published" };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const provider = await getProviderForSession();

  if (!user || !provider) {
    return <SignInPrompt />;
  }

  let sites: SiteView[] = [];
  let loadError: string | null = null;
  try {
    sites = await loadSites(provider);
  } catch (err) {
    loadError = (err as Error).message;
  }

  const mode = getAuthMode();

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">dashboard</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>

      <main className="pw-dash">
        <div className="pw-dash__head">
          <div>
            <h1 className="pw-dash__title">Your sites</h1>
            <p className="pw-dash__subtitle">
              Signed in as <strong>@{user.login}</strong>
              {mode === "mock" ? " · demo mode (no GitHub calls)" : ""}. Pagewright manages every
              repo tagged <code>pagewright</code>.
            </p>
          </div>
          <Link href="/new" className="pw-btn pw-btn--primary">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            <span>New site</span>
          </Link>
        </div>

        {loadError && (
          <div className="pw-alert pw-alert--error" role="alert">
            Couldn&apos;t load your sites: {loadError}
          </div>
        )}

        {!loadError && sites.length === 0 && <EmptyState />}

        {sites.length > 0 && (
          <ul className="pw-sitegrid">
            {sites.map((site) => (
              <SiteCard key={site.repo.id} site={site} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function SiteCard({ site }: { site: SiteView }) {
  const { repo, pages } = site;
  const status = deriveStatus(site);
  return (
    <li className="pw-sitecard">
      <SiteThumb site={site} status={status} />

      <div className="pw-sitecard__body">
        <div className="pw-sitecard__top">
          <span className={`pw-status pw-status--${status.tone}`}>
            {status.tone === "deploying" ? (
              <Loader2 size={13} strokeWidth={2.5} className="pw-spin" aria-hidden="true" />
            ) : (
              <span className="pw-status__dot" aria-hidden="true" />
            )}
            {status.label}
          </span>
          {repo.private && <span className="pw-chip">Private</span>}
        </div>

        <h2 className="pw-sitecard__name">{repo.name}</h2>
        {repo.description && <p className="pw-sitecard__desc">{repo.description}</p>}

        <div className="pw-sitecard__links">
          {pages.url && (
            <a className="pw-linkpill" href={pages.url} target="_blank" rel="noreferrer">
              <Globe size={14} aria-hidden="true" />
              <span>Visit site</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <a className="pw-linkpill" href={repo.htmlUrl} target="_blank" rel="noreferrer">
            <GitHubMark size={14} aria-hidden="true" />
            <span>Repo</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>

        <div className="pw-sitecard__actions">
          <Link
            href={`/sites/${repo.owner}/${repo.name}`}
            className="pw-btn pw-btn--ghost pw-btn--sm"
          >
            <span>Manage</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * A live, at-scale preview of the site's home page. Rather than a screenshot service (which would
 * need external infra and wouldn't work in demo mode), we render the exact same block components the
 * deployed Astro site uses, then shrink the whole thing into a fixed 16:10 frame with a CSS
 * transform. Sites without a parseable home page fall back to a branded gradient placeholder.
 */
function SiteThumb({
  site,
  status,
}: {
  site: SiteView;
  status: { tone: StatusTone; label: string };
}) {
  const { repo, pages, previewBlocks } = site;
  const href = pages.url ?? `/sites/${repo.owner}/${repo.name}`;
  const external = Boolean(pages.url);

  const inner =
    previewBlocks && previewBlocks.length > 0 ? (
      <div className="pw-sitethumb__frame" aria-hidden="true">
        <div className="pw-sitethumb__page pw-root">
          <PageRenderer blocks={previewBlocks} site={site.siteConfig} />
        </div>
      </div>
    ) : (
      <div className="pw-sitethumb__placeholder" aria-hidden="true">
        <span className="pw-sitethumb__initial">{repo.name.charAt(0).toUpperCase()}</span>
      </div>
    );

  return (
    <div className="pw-sitethumb">
      {inner}
      <a
        className="pw-sitethumb__overlay"
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        aria-label={external ? `Open live site ${repo.name}` : `Manage ${repo.name}`}
      >
        {external ? (
          <>
            <Globe size={14} aria-hidden="true" />
            <span>Open live site</span>
          </>
        ) : (
          <>
            <ArrowUpRight size={14} aria-hidden="true" />
            <span>{status.tone === "deploying" ? "Deploying…" : "Set up site"}</span>
          </>
        )}
      </a>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pw-empty">
      <div className="pw-empty__icon" aria-hidden="true">
        <Rocket size={26} strokeWidth={2} />
      </div>
      <h2 className="pw-empty__title">No sites yet</h2>
      <p className="pw-empty__body">
        Create your first site from a template. Pagewright provisions the repo, wires up the deploy
        workflows, and publishes it to GitHub Pages.
      </p>
      <Link href="/new" className="pw-btn pw-btn--primary">
        <Plus size={16} strokeWidth={2} aria-hidden="true" />
        <span>Create a site</span>
      </Link>
    </div>
  );
}

function SignInPrompt() {
  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/" className="pw-appbar__brandlink">
            Pagewright
          </Link>
        </span>
        <ThemeToggle />
      </header>
      <main className="pw-dash">
        <div className="pw-empty">
          <div className="pw-empty__icon" aria-hidden="true">
            <GitHubMark size={26} />
          </div>
          <h2 className="pw-empty__title">Sign in to continue</h2>
          <p className="pw-empty__body">
            Connect your GitHub account to see and manage the sites Pagewright builds for you.
          </p>
          <a href="/api/auth/login" className="pw-btn pw-btn--primary">
            <GitHubMark size={16} aria-hidden="true" />
            <span>Sign in with GitHub</span>
          </a>
        </div>
      </main>
    </>
  );
}
