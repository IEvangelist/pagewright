import Link from "next/link";
import type { Block } from "@pagewright/blocks";
import { AuthButton } from "@/components/auth-button";
import { TemplateCard } from "@/components/template-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { TEMPLATES } from "@/lib/templates";
import { loadTemplateHomeBlocks } from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const previews: Record<string, Block[]> = Object.fromEntries(
    TEMPLATES.map((template) => [template.id, loadTemplateHomeBlocks(template.id)]),
  );

  return (
    <>
      <header className="pw-appbar pw-marketingbar">
        <Link href="/" className="pw-appbar__brand pw-appbar__brandlink">
          Pagewright
        </Link>
        <nav className="pw-marketingbar__nav" aria-label="Main navigation">
          <Link href="/templates" aria-current="page">
            Templates
          </Link>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-template-gallery-page">
        <div className="pw-template-gallery-page__head">
          <h1>Choose a starting point</h1>
          <p>Every preview below renders the same starter blocks that Pagewright will publish.</p>
        </div>
        <div className="pw-gallery">
          {TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              blocks={previews[template.id]}
            />
          ))}
        </div>
      </main>
    </>
  );
}
