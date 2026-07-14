import { PageRenderer, parsePage } from "@pagewright/blocks";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth-button";
import { LandingMotion } from "@/components/landing-motion";
import demoPage from "@/demo-page.json";

/**
 * Pagewright's own marketing page — dogfooded through the exact same block renderer that the
 * generated Astro sites use. What you see here is what ships to GitHub Pages (pixel-for-pixel),
 * which is the whole point: one block library, zero preview drift.
 */
export default function Home() {
  const page = parsePage(demoPage);

  return (
    <div className="pw-landing">
      {/* Decorative, landing-only ambient color. The motion layer is intentionally limited to
          scroll reveals and does not follow the pointer. */}
      <div className="pw-landing__backdrop" aria-hidden="true">
        <div className="pw-landing__grid" />
        <span className="pw-landing__blob pw-landing__blob--1" />
        <span className="pw-landing__blob pw-landing__blob--2" />
        <span className="pw-landing__blob pw-landing__blob--3" />
      </div>
      <header className="pw-appbar">
        <span className="pw-appbar__brand">
          Pagewright <span className="pw-appbar__badge">builder</span>
        </span>
        <div className="pw-appbar__actions">
          <AuthButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="pw-root pw-landing__content">
        <PageRenderer blocks={page.blocks} />
      </main>
      <LandingMotion />
    </div>
  );
}
