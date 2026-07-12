import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { NewSiteWizard } from "@/components/new-site-wizard";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * The one-click site-creation experience: pick a template, configure it, and Pagewright provisions
 * the repo + deploy workflows with live progress. Auth is enforced server-side before the wizard
 * (which talks to the streaming provisioning route) ever renders.
 */
export default async function NewSitePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/login");

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/dashboard" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">new site</span>
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
        <NewSiteWizard login={user.login} />
      </main>
    </>
  );
}
