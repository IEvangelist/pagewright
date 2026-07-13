"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A global top-of-viewport progress bar that gives immediate feedback the instant a user starts a
 * navigation, before the destination's server component has streamed anything. App Router (< 15.3,
 * no `useLinkStatus`) shows nothing during a route transition, which is what made the app feel
 * unresponsive. This listens for internal link clicks to *start* the bar and completes it when the
 * pathname actually changes (the destination committed). A safety timeout guarantees the bar never
 * gets stuck if a click is cancelled or resolves to the same URL.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const active = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPath = useRef(pathname);

  function clearRamps() {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    if (safety.current) {
      clearTimeout(safety.current);
      safety.current = null;
    }
  }

  function start() {
    if (active.current) return;
    active.current = true;
    if (hide.current) {
      clearTimeout(hide.current);
      hide.current = null;
    }
    setVisible(true);
    setProgress(0.08);
    // Trickle asymptotically toward 90% so the bar keeps moving while we wait on the server.
    trickle.current = setInterval(() => {
      setProgress((p) => (p < 0.9 ? p + (0.9 - p) * 0.14 : p));
    }, 180);
    // Never let the bar hang (same-URL clicks, server redirects, cancelled navs).
    safety.current = setTimeout(finish, 10_000);
  }

  function finish() {
    if (!active.current) return;
    active.current = false;
    clearRamps();
    setProgress(1);
    hide.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 240);
  }

  // Complete whenever the route actually changes, however the navigation was triggered.
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || href.startsWith("#") || anchor.hasAttribute("download")) return;
      if (target && target !== "_self") return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same-page (hash / identical path) navigations don't stream a new route.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearRamps();
      if (hide.current) clearTimeout(hide.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;
  return (
    <div className="pw-navprogress" role="presentation" aria-hidden="true">
      <div className="pw-navprogress__bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
