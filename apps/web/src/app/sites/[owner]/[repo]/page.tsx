import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Pencil, Settings2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { DeployProgress } from "@/components/deploy-progress";
import { PublishPanel } from "@/components/publish-panel";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeployStatus } from "@/lib/deploy/server";
import { getPublishState } from "@/lib/publish/server";

export const dynamic = "force-dynamic";

/** Whether a site supports blog posts (blog template, or posts already present). */
async function siteHasPosts(
  provider: Awaited<ReturnType<typeof getProviderForSession>>,
  ref: { owner: string; repo: string },
): Promise<boolean> {
  if (!provider) return false;
  const config = await provider.getFile(ref, "pagewright.json").catch(() => null);
  if (config) {
    try {
      if ((JSON.parse(config.content) as { templateId?: string }).templateId === "blog") return true;
    } catch {
      // fall through to a directory probe
    }
  }
  const entries = await provider.listDirectory(ref, "src/data/posts").catch(() => []);
  return entries.some((e) => e.type === "file" && e.name.endsWith(".json"));
}

/**
 * Per-site manage view. Renders the live deployment-progress experience (ordered steps, expandable
 * details, deep links, congratulatory completion) from a server-captured snapshot, then the client
 * component keeps it live. The editor, media, and publish/unpublish controls attach here in later
 * steps.
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
  const ref = { owner, repo: repoName };
  // Fetch the deploy snapshot, publish state, and blog capability concurrently — independent reads.
  const [status, publishState, hasPosts] = await Promise.all([
    getDeployStatus(provider, ref),
    getPublishState(provider, ref).catch(() => null),
    siteHasPosts(provider, ref),
  ]);
  if (!status) notFound();

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/dashboard" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">{status.repo}</span>
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
            <h1 className="pw-dash__title">{status.repo}</h1>
            <p className="pw-dash__subtitle">Deployment status &amp; live site</p>
          </div>
          <div className="pw-dash__headactions">
            <Link
              className="pw-btn pw-btn--ghost"
              href={`/sites/${status.owner}/${status.repo}/settings`}
            >
              <Settings2 size={16} aria-hidden="true" /> Site settings
            </Link>
            {hasPosts ? (
              <Link
                className="pw-btn pw-btn--ghost"
                href={`/sites/${status.owner}/${status.repo}/posts`}
              >
                <FileText size={16} aria-hidden="true" /> Manage posts
              </Link>
            ) : null}
            <Link
              className="pw-btn pw-btn--primary"
              href={`/sites/${status.owner}/${status.repo}/edit`}
            >
              <Pencil size={16} aria-hidden="true" /> Open editor
            </Link>
          </div>
        </div>

        <DeployProgress initial={status} />

        {publishState ? <PublishPanel initial={publishState} /> : null}
      </main>
    </>
  );
}
