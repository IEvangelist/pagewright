import { PageRenderer, parsePage } from "@pagewright/blocks";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import demoPage from "@/demo-page.json";

/**
 * Pagewright's own marketing page — dogfooded through the exact same block renderer that the
 * generated Astro sites use. What you see here is what ships to GitHub Pages (pixel-for-pixel),
 * which is the whole point: one block library, zero preview drift.
 */
export default function Home() {
  const page = parsePage(demoPage);

  return (
    <>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          Pagewright <span className="pw-appbar__badge">builder</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-root">
        <PageRenderer blocks={page.blocks} />
      </main>
    </>
  );
}
