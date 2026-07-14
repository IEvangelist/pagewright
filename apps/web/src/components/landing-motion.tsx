"use client";

import { useEffect } from "react";

/**
 * Landing-only motion enhancer. Everything here is progressive polish layered on top of the shared
 * block markup. It queries inside `.pw-landing`, adds a `pw-motion` flag class (so the hidden
 * pre-reveal states only apply when JS is live, avoiding a no-JS flash), and wires a restrained
 * scroll reveal as sections enter the viewport.
 *
 * It renders nothing and fully bails out under `prefers-reduced-motion: reduce`, so the page stays
 * calm for people who ask for that. Generated Astro sites never load this — it's builder-only.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pw-landing");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("pw-motion");
    const cleanups: Array<() => void> = [];

    const revealTargets = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".pw-landing__templates-head, .pw-landing__template-grid .pw-tplcard, .pw-landing__workflow-copy, .pw-landing__workflow-list, .pw-landing__closing-inner, .pw-landing__footer",
      ),
    );
    revealTargets.forEach((el, i) => {
      el.classList.add("pw-reveal");
      el.style.setProperty("--pw-reveal-delay", `${Math.min(i, 6) * 55}ms`);
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("pw-reveal--in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    revealTargets.forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
