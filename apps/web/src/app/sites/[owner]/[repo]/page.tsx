import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { GitHubMark } from "@/components/icons/github-mark";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Per-site manage view. Loads real repo + Pages + latest-run state through the provider today; the
 * editor, media, and publish/unpublish controls attach here in later steps.
 */
export default async function SiteManagePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const user = await getCurrentUser();
  const provider = await getProviderForSession();
  if (!user || !provider) redirect("/api/auth/login");

  const { owner, repo: repoName } = await params;
  const repo = await provider.getRepo({ owner, repo: repoName });
  if (!repo) notFound();

  const [pages, runs] = await Promise.all([
    provider.getPages({ owner, repo: repoName }).catch(() => null),
    provider.listWorkflowRuns({ owner, repo: repoName }, { perPage: 1 }).catch(() => []),
  ]);
  const latestRun = runs[0] ?? null;

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/dashboard" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">{repo.name}</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-dash">
        <Link href="/dashboard" className="pw-backlink">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to dashboard</span>
        </Link>

        <div className="pw-dash__head">
          <div>
            <h1 className="pw-dash__title">{repo.name}</h1>
            <p className="pw-dash__subtitle">{repo.description ?? "No description"}</p>
          </div>
        </div>

        <div className="pw-sitecard__links" style={{ marginBottom: 24 }}>
          {pages?.url && (
            <a className="pw-linkpill" href={pages.url} target="_blank" rel="noreferrer">
              <Globe size={14} aria-hidden="true" />
              <span>Visit site</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <a className="pw-linkpill" href={repo.htmlUrl} target="_blank" rel="noreferrer">
            <GitHubMark size={14} aria-hidden="true" />
            <span>Open repo</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          {latestRun && (
            <a className="pw-linkpill" href={latestRun.htmlUrl} target="_blank" rel="noreferrer">
              <span>Latest deploy: {latestRun.status}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>

        <div className="pw-empty">
          <h2 className="pw-empty__title">Editor & publishing controls coming soon</h2>
          <p className="pw-empty__body">
            The visual builder, media library, and draft/schedule/publish controls attach to this
            page in the next steps. Your connection and this site&apos;s live status are already
            wired through GitHub.
          </p>
        </div>
      </main>
    </>
  );
}
