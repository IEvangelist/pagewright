import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { TemplateDemo, type DemoFeature, type DemoPostRef } from "@/components/template-demo";
import { getTemplateMeta } from "@/lib/templates";
import { loadTemplatePosts } from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";

/** Curated "what you get" copy per template for the demo side panel. */
const FEATURES: Record<string, DemoFeature[]> = {
  landing: [
    { title: "Conversion-first hero", body: "A bold headline, subhead, and primary call-to-action above the fold." },
    { title: "Feature grid", body: "Explain your product in scannable, icon-led cards." },
    { title: "Fast & SEO-ready", body: "Static HTML, meta tags, and sitemap out of the box." },
    { title: "One-page focus", body: "Everything a launch or campaign needs on a single, quick page." },
  ],
  blog: [
    { title: "Post index + articles", body: "A clean home feed and readable article pages, styled for long-form." },
    { title: "Drafts and scheduling", body: "Write ahead, mark drafts, and schedule posts. Future posts show as “Coming soon.”" },
    { title: "Own your content", body: "Every post is Markdown committed to your repo. No lock-in." },
    { title: "RSS-ready", body: "A feed your readers can subscribe to from day one." },
  ],
  portfolio: [
    { title: "Project showcase", body: "Feature your best work with cover images and links." },
    { title: "About & contact", body: "Tell your story and make it easy to reach you." },
    { title: "Personal brand", body: "Pick an accent color and theme that feels like you." },
    { title: "Always current", body: "Update from Pagewright and redeploy in one click." },
  ],
};

export default async function TemplateDemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = getTemplateMeta(id as never);
  if (!meta) {
    notFound();
  }

  const posts: DemoPostRef[] =
    id === "blog"
      ? loadTemplatePosts(id as never).published.map((p) => ({ slug: p.slug, title: p.title }))
      : [];

  const features = FEATURES[id] ?? [];

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          <Link href="/" className="pw-appbar__brandlink">
            Pagewright
          </Link>
          <span className="pw-appbar__badge">preview</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-dash pw-demopage">
        <Link href="/templates" className="pw-backlink">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to templates</span>
        </Link>

        <div className="pw-demopage__head">
          <span className="pw-demopage__cat">{meta.category}</span>
          <h1 className="pw-demopage__title">{meta.name}</h1>
          <p className="pw-demopage__tagline">{meta.tagline}</p>
        </div>

        <TemplateDemo templateId={id} templateName={meta.name} posts={posts} features={features} />
      </main>
    </>
  );
}
