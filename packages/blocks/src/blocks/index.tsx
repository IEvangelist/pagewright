import * as React from "react";
import type {
  BlockProps,
  BlockType,
  Link,
} from "../schema";

/**
 * Block components. Plain React + scoped `pw-` CSS classes (see styles/blocks.css) so they render
 * pixel-identically in the Next.js builder preview and in generated Astro sites (via @astrojs/react).
 * No Tailwind dependency here on purpose — that keeps the two consumers perfectly in sync.
 */

function CtaLink({ link, variant }: { link?: Link; variant: "primary" | "secondary" }) {
  if (!link) return null;
  return (
    <a className={`pw-btn pw-btn--${variant}`} href={link.href}>
      {link.label}
    </a>
  );
}

export function Navbar({ brand, logo, links = [], cta }: BlockProps<"navbar">) {
  return (
    <nav className="pw-navbar">
      <div className="pw-container pw-navbar__inner">
        <a className="pw-navbar__brand" href="/">
          {logo ? <img className="pw-navbar__logo" src={logo} alt={brand} /> : null}
          <span>{brand}</span>
        </a>
        <div className="pw-navbar__links">
          {links.map((l, i) => (
            <a key={i} className="pw-navbar__link" href={l.href}>
              {l.label}
            </a>
          ))}
          <CtaLink link={cta} variant="primary" />
        </div>
      </div>
    </nav>
  );
}

export function Hero({
  eyebrow,
  heading,
  subheading,
  primaryCta,
  secondaryCta,
  image,
  align = "center",
}: BlockProps<"hero">) {
  return (
    <header className={`pw-hero pw-hero--${align}`}>
      <div className="pw-container pw-hero__inner">
        <div className="pw-hero__content">
          {eyebrow ? <p className="pw-hero__eyebrow">{eyebrow}</p> : null}
          <h1 className="pw-hero__heading">{heading}</h1>
          {subheading ? <p className="pw-hero__subheading">{subheading}</p> : null}
          <div className="pw-hero__actions">
            <CtaLink link={primaryCta} variant="primary" />
            <CtaLink link={secondaryCta} variant="secondary" />
          </div>
        </div>
        {image ? (
          <div className="pw-hero__media">
            <img src={image} alt={heading} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function Features({
  heading,
  subheading,
  columns = 3,
  items = [],
}: BlockProps<"features">) {
  return (
    <section className="pw-section pw-features">
      <div className="pw-container">
        {heading ? <h2 className="pw-section__heading">{heading}</h2> : null}
        {subheading ? <p className="pw-section__subheading">{subheading}</p> : null}
        <div className={`pw-features__grid pw-cols-${columns}`}>
          {items.map((item, i) => (
            <div key={i} className="pw-feature">
              {item.icon ? <div className="pw-feature__icon" aria-hidden>{item.icon}</div> : null}
              <h3 className="pw-feature__title">{item.title}</h3>
              <p className="pw-feature__body">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Cta({ heading, body, primaryCta, secondaryCta }: BlockProps<"cta">) {
  return (
    <section className="pw-section pw-cta">
      <div className="pw-container pw-cta__inner">
        <h2 className="pw-cta__heading">{heading}</h2>
        {body ? <p className="pw-cta__body">{body}</p> : null}
        <div className="pw-cta__actions">
          <CtaLink link={primaryCta} variant="primary" />
          <CtaLink link={secondaryCta} variant="secondary" />
        </div>
      </div>
    </section>
  );
}

export function Prose({ html = "" }: BlockProps<"prose">) {
  return (
    <section className="pw-section">
      <div
        className="pw-container pw-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}

export function Footer({ brand, tagline, links = [], copyright }: BlockProps<"footer">) {
  return (
    <footer className="pw-footer">
      <div className="pw-container pw-footer__inner">
        <div className="pw-footer__brand">
          {brand ? <strong>{brand}</strong> : null}
          {tagline ? <p className="pw-footer__tagline">{tagline}</p> : null}
        </div>
        <div className="pw-footer__links">
          {links.map((l, i) => (
            <a key={i} className="pw-footer__link" href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
      {copyright ? <div className="pw-container pw-footer__copyright">{copyright}</div> : null}
    </footer>
  );
}

/** Maps a block type to its React component. */
export const blockRegistry: {
  [K in BlockType]: React.FC<BlockProps<K>>;
} = {
  navbar: Navbar,
  hero: Hero,
  features: Features,
  cta: Cta,
  prose: Prose,
  footer: Footer,
};
