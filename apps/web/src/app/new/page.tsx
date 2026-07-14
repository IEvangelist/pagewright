import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Block, SiteConfig } from "@pagewright/blocks";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { NewSiteWizard } from "@/components/new-site-wizard";
import { getCurrentUser } from "@/lib/auth/session";
import { TEMPLATES } from "@/lib/templates";
import { loadTemplateHomeBlocks, loadTemplateSite } from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";

/**
 * The one-click site-creation experience: pick a template, configure it, and Pagewright provisions
 * the repo + deploy workflows with live progress. Browsing templates is fully public — sign-in is
 * only required for the real operation (provisioning), which the wizard gates at launch time.
 */
export default async function NewSitePage() {
  const user = await getCurrentUser();

  // Real at-scale gallery previews: read each template's starter home page from the provision
  // bundle (server-only) and hand the blocks to the wizard, which renders them like the dashboard
  // site thumbnails instead of flat gradient placeholders.
  const previews: Record<string, { blocks: Block[]; site: SiteConfig | null }> = {};
  for (const template of TEMPLATES) {
    previews[template.id] = {
      blocks: loadTemplateHomeBlocks(template.id),
      site: loadTemplateSite(template.id),
    };
  }

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href={user ? "/dashboard" : "/"} className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__context">Create site</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-dash pw-newsite">
        <nav className="pw-crumbs" aria-label="Breadcrumb">
          <Link href={user ? "/dashboard" : "/"}>{user ? "Dashboard" : "Home"}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Create site</span>
        </nav>
        <NewSiteWizard login={user?.login ?? null} previews={previews} />
      </main>
    </>
  );
}
