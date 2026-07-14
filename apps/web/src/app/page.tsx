import Link from "next/link";
import { ArrowRight, Blocks, GitBranch, Rocket } from "lucide-react";
import type { Block, SiteConfig } from "@pagewright/blocks";
import { AuthButton } from "@/components/auth-button";
import { LandingMotion } from "@/components/landing-motion";
import { TemplateCard } from "@/components/template-card";
import { TemplatePreview } from "@/components/template-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { getLandingCtas, templateDemoHref } from "@/lib/landing-content";
import { TEMPLATES } from "@/lib/templates";
import { loadTemplateHomeBlocks, loadTemplateSite } from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  const ctas = getLandingCtas(Boolean(user));
  const previews = loadPreviews();
  const featuredTemplate = TEMPLATES.find((template) => template.id === "blog") ?? TEMPLATES[0]!;

  return (
    <div className="pw-landing">
      <header className="pw-appbar pw-marketingbar">
        <Link href="/" className="pw-appbar__brand pw-appbar__brandlink">
          Pagewright
        </Link>
        <nav className="pw-marketingbar__nav" aria-label="Main navigation">
          <Link href="/templates">Templates</Link>
          <Link href="#how-it-works">How it works</Link>
        </nav>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>

      <main className="pw-landing__content">
        <section className="pw-landing__hero">
          <div className="pw-landing__hero-copy">
            <p className="pw-landing__eyebrow">Your site, your repository</p>
            <h1>Build it. Own it.</h1>
            <p className="pw-landing__lede">
              Choose a real template, edit visually, and publish from your own GitHub repository.
            </p>
            <div className="pw-landing__actions">
              <Link className="pw-btn pw-btn--primary pw-landing__primary" href={ctas.heroPrimary.href}>
                {ctas.heroPrimary.label}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="pw-btn pw-btn--ghost" href={ctas.heroSecondary.href}>
                {ctas.heroSecondary.label}
              </Link>
            </div>
          </div>

          <div className="pw-landing__hero-visual">
            <div className="pw-landing__preview-head">
              <span>Live starter</span>
              <Link href={templateDemoHref(featuredTemplate.id)}>
                Preview {featuredTemplate.name.toLowerCase()}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <TemplatePreview
              className="pw-landing__hero-preview"
              blocks={previews[featuredTemplate.id]?.blocks}
              site={previews[featuredTemplate.id]?.site ?? undefined}
              name={featuredTemplate.name}
              gradient={`linear-gradient(135deg, ${featuredTemplate.preview.from}, ${featuredTemplate.preview.to})`}
            />
            <p className="pw-landing__preview-note">
              The preview uses the same blocks Pagewright publishes.
            </p>
          </div>
        </section>

        <section className="pw-landing__templates" aria-labelledby="template-heading">
          <div className="pw-landing__templates-head">
            <h2 id="template-heading">Start with a working site</h2>
            <p>Open any starter, inspect every page, then carry your choice into setup.</p>
          </div>
          <div className="pw-landing__template-grid">
            {TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                blocks={previews[template.id]?.blocks}
                site={previews[template.id]?.site ?? undefined}
              />
            ))}
          </div>
        </section>

        <section className="pw-landing__workflow" id="how-it-works" aria-labelledby="workflow-heading">
          <div className="pw-landing__workflow-copy">
            <h2 id="workflow-heading">Pagewright handles the setup</h2>
            <p>
              You choose the content and style. Pagewright creates the repository, deployment, and
              editing workflow.
            </p>
          </div>
          <div className="pw-landing__workflow-list">
            <article>
              <Blocks size={22} aria-hidden="true" />
              <div>
                <h3>Choose and edit</h3>
                <p>Start from real blocks and shape them in a visual editor.</p>
              </div>
            </article>
            <article>
              <GitBranch size={22} aria-hidden="true" />
              <div>
                <h3>Own every change</h3>
                <p>Your pages and media stay in a GitHub repository you control.</p>
              </div>
            </article>
            <article>
              <Rocket size={22} aria-hidden="true" />
              <div>
                <h3>Publish normally</h3>
                <p>GitHub Actions builds and deploys updates without a separate hosting workflow.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="pw-landing__closing">
          <div className="pw-landing__closing-inner">
            <div>
              <h2>{user ? "Your sites are ready when you are" : "Create when you are ready"}</h2>
              <p>
                {user
                  ? "Open your dashboard to edit a site or start another."
                  : "Explore first. GitHub sign-in is only needed when Pagewright creates your site."}
              </p>
            </div>
            <Link className="pw-btn pw-btn--primary" href={ctas.final.href}>
              {ctas.final.label}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="pw-landing__footer">
        <strong>Pagewright</strong>
        <nav aria-label="Footer navigation">
          <Link href="/templates">Templates</Link>
          <Link href="/new">Create a site</Link>
          <a href="https://github.com/IEvangelist/pagewright">GitHub</a>
        </nav>
      </footer>
      <LandingMotion />
    </div>
  );
}

function loadPreviews(): Record<string, { blocks: Block[]; site: SiteConfig | null }> {
  return Object.fromEntries(
    TEMPLATES.map((template) => [
      template.id,
      {
        blocks: loadTemplateHomeBlocks(template.id),
        site: loadTemplateSite(template.id),
      },
    ]),
  );
}
