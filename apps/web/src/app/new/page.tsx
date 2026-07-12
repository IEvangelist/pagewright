import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Placeholder for the template gallery + one-click provisioning flow (built in the site-creation
 * step). It already enforces auth so the route behaves correctly end-to-end today.
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
        <div className="pw-empty">
          <div className="pw-empty__icon" aria-hidden="true">
            <Hammer size={26} strokeWidth={2} />
          </div>
          <h2 className="pw-empty__title">Template gallery coming next</h2>
          <p className="pw-empty__body">
            You&apos;re signed in and ready. The one-click template gallery — pick a blog, portfolio,
            or landing page and Pagewright provisions the repo and deploy workflows — lands in the
            next build step.
          </p>
        </div>
      </main>
    </>
  );
}
