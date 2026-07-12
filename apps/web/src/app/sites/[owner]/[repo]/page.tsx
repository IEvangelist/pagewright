import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { DeployProgress } from "@/components/deploy-progress";
import { getProviderForSession } from "@/lib/auth/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeployStatus } from "@/lib/deploy/server";

export const dynamic = "force-dynamic";

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
  const status = await getDeployStatus(provider, { owner, repo: repoName });
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
          <Link
            className="pw-btn pw-btn--primary"
            href={`/sites/${status.owner}/${status.repo}/edit`}
          >
            <Pencil size={16} aria-hidden="true" /> Open editor
          </Link>
        </div>

        <DeployProgress initial={status} />

        <div className="pw-empty" style={{ marginTop: 24 }}>
          <h2 className="pw-empty__title">Editor &amp; publishing controls coming soon</h2>
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
