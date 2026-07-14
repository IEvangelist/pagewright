"use client";

import { useEffect } from "react";

/**
 * Landing-only motion enhancer. Everything here is progressive polish layered on top of the shared
 * block markup — it queries inside `.pw-landing`, adds a `pw-motion` flag class (so the hidden
 * pre-reveal states only apply when JS is live, avoiding a no-JS flash), and wires four effects:
 *
 *   1. Scroll reveal   — sections rise + fade in as they enter the viewport (IntersectionObserver).
 *   2. Pointer aura    — a soft spotlight + gentle backdrop parallax track the cursor.
 *   3. Magnetic CTA    — the hero's primary button leans toward the pointer when it's near.
 *   4. Card tilt       — feature cards tilt in 3D with a highlight that follows the pointer.
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

    // 1) Scroll reveal ────────────────────────────────────────────────────────────
    const revealTargets = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".pw-features .pw-section__heading, .pw-features .pw-section__subheading, .pw-feature, .pw-cta__inner, .pw-footer__inner",
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

    // 2) Pointer aura (spotlight + backdrop parallax), rAF-batched ─────────────────
    let px = 0.5;
    let py = 0.28;
    let auraRaf = 0;
    let auraPending = false;
    const applyAura = () => {
      auraPending = false;
      root.style.setProperty("--pw-mx", `${(px * 100).toFixed(2)}%`);
      root.style.setProperty("--pw-my", `${(py * 100).toFixed(2)}%`);
      root.style.setProperty("--pw-par-x", `${((px - 0.5) * 26).toFixed(1)}px`);
      root.style.setProperty("--pw-par-y", `${((py - 0.5) * 26).toFixed(1)}px`);
    };
    const onAuraMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width;
      py = (e.clientY - r.top) / r.height;
      if (!auraPending) {
        auraPending = true;
        auraRaf = requestAnimationFrame(applyAura);
      }
    };
    window.addEventListener("pointermove", onAuraMove, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("pointermove", onAuraMove);
      cancelAnimationFrame(auraRaf);
    });

    // 3) Magnetic hero CTA ─────────────────────────────────────────────────────────
    const magnet = root.querySelector<HTMLElement>(".pw-hero__actions .pw-btn--primary");
    if (magnet) {
      const strength = 0.32;
      const onMagnetMove = (e: PointerEvent) => {
        const r = magnet.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const reach = Math.max(r.width, r.height) * 0.9 + 70;
        if (Math.hypot(dx, dy) < reach) {
          magnet.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
          magnet.style.setProperty("--pw-magnet", "1");
        } else if (magnet.style.transform) {
          magnet.style.transform = "";
          magnet.style.setProperty("--pw-magnet", "0");
        }
      };
      const onMagnetLeave = () => {
        magnet.style.transform = "";
        magnet.style.setProperty("--pw-magnet", "0");
      };
      window.addEventListener("pointermove", onMagnetMove, { passive: true });
      magnet.addEventListener("pointerleave", onMagnetLeave);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMagnetMove);
        magnet.removeEventListener("pointerleave", onMagnetLeave);
      });
    }

    // 4) 3D tilt + pointer highlight on feature cards ─────────────────────────────
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".pw-feature"));
    cards.forEach((card) => {
      card.classList.add("pw-tilt");
      let cardRaf = 0;
      const onCardMove = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        const mx = (e.clientX - r.left) / r.width;
        const my = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(cardRaf);
        cardRaf = requestAnimationFrame(() => {
          card.style.setProperty("--pw-cmx", `${(mx * 100).toFixed(1)}%`);
          card.style.setProperty("--pw-cmy", `${(my * 100).toFixed(1)}%`);
          card.style.setProperty("--pw-roty", `${((mx - 0.5) * 9).toFixed(2)}deg`);
          card.style.setProperty("--pw-rotx", `${((0.5 - my) * 9).toFixed(2)}deg`);
        });
      };
      const onCardLeave = () => {
        cancelAnimationFrame(cardRaf);
        card.style.setProperty("--pw-rotx", "0deg");
        card.style.setProperty("--pw-roty", "0deg");
      };
      card.addEventListener("pointermove", onCardMove, { passive: true });
      card.addEventListener("pointerleave", onCardLeave);
      cleanups.push(() => {
        card.removeEventListener("pointermove", onCardMove);
        card.removeEventListener("pointerleave", onCardLeave);
        cancelAnimationFrame(cardRaf);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
