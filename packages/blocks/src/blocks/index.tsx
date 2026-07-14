import * as React from "react";
import type {
  BlockProps,
  BlockType,
  Link,
} from "../schema";
import { BlockIcon } from "../icons";
import { withBase, normalizeBase, type BaseAware } from "../base";
import { getGitHubDiscussionsConfigIssues } from "../post-components";

/**
 * Block components. Plain React + scoped `pw-` CSS classes (see styles/blocks.css) so they render
 * pixel-identically in the Next.js builder preview and in generated Astro sites (via @astrojs/react).
 * No Tailwind dependency here on purpose — that keeps the two consumers perfectly in sync.
 *
 * Each block accepts an optional `base` (the site base path) threaded down from PageRenderer so that
 * root-relative image/link URLs resolve on GitHub Pages project sites.
 */

function CtaLink({
  link,
  variant,
  base,
}: {
  link?: Link;
  variant: "primary" | "secondary";
  base?: string;
}) {
  if (!link) return null;
  return (
    <a className={`pw-btn pw-btn--${variant}`} href={withBase(base, link.href)}>
      {link.label}
    </a>
  );
}

export function Navbar({ brand, logo, links = [], cta, base }: BlockProps<"navbar"> & BaseAware) {
  return (
    <nav className="pw-navbar">
      <div className="pw-container pw-navbar__inner">
        <a className="pw-navbar__brand" href={withBase(base, "/")}>
          {logo ? <img className="pw-navbar__logo" src={withBase(base, logo)} alt={brand} /> : null}
          <span>{brand}</span>
        </a>
        <div className="pw-navbar__links">
          {links.map((l, i) => (
            <a key={i} className="pw-navbar__link" href={withBase(base, l.href)}>
              {l.label}
            </a>
          ))}
          <CtaLink link={cta} variant="primary" base={base} />
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
  base,
}: BlockProps<"hero"> & BaseAware) {
  return (
    <header className={`pw-hero pw-hero--${align}`}>
      <div className="pw-container pw-hero__inner">
        <div className="pw-hero__content">
          {eyebrow ? <p className="pw-hero__eyebrow">{eyebrow}</p> : null}
          <h1 className="pw-hero__heading">{heading}</h1>
          {subheading ? <p className="pw-hero__subheading">{subheading}</p> : null}
          <div className="pw-hero__actions">
            <CtaLink link={primaryCta} variant="primary" base={base} />
            <CtaLink link={secondaryCta} variant="secondary" base={base} />
          </div>
        </div>
        {image ? (
          <div className="pw-hero__media">
            <img src={withBase(base, image)} alt={heading} />
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
              {item.icon ? (
                <div className="pw-feature__icon" aria-hidden>
                  <BlockIcon name={item.icon} size={26} />
                </div>
              ) : null}
              <h3 className="pw-feature__title">{item.title}</h3>
              <p className="pw-feature__body">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Gallery({
  heading,
  subheading,
  columns = 3,
  items = [],
  base,
}: BlockProps<"gallery"> & BaseAware) {
  return (
    <section className="pw-section pw-gallery">
      <div className="pw-container">
        {heading ? <h2 className="pw-section__heading">{heading}</h2> : null}
        {subheading ? <p className="pw-section__subheading">{subheading}</p> : null}
        <div className={`pw-gallery__grid pw-cols-${columns}`}>
          {items.map((item, i) => {
            const inner = (
              <>
                {item.image ? (
                  <div className="pw-gallery__media">
                    <img src={withBase(base, item.image)} alt={item.title} loading="lazy" />
                  </div>
                ) : null}
                <div className="pw-gallery__body">
                  <h3 className="pw-gallery__title">{item.title}</h3>
                  {item.description ? (
                    <p className="pw-gallery__desc">{item.description}</p>
                  ) : null}
                  {item.tags?.length ? (
                    <div className="pw-gallery__tags">
                      {item.tags.map((t, ti) => (
                        <span key={ti} className="pw-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            );
            return item.href ? (
              <a
                key={i}
                className="pw-gallery__item pw-gallery__item--link"
                href={withBase(base, item.href)}
              >
                {inner}
              </a>
            ) : (
              <div key={i} className="pw-gallery__item">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Cta({
  heading,
  body,
  primaryCta,
  secondaryCta,
  base,
}: BlockProps<"cta"> & BaseAware) {
  return (
    <section className="pw-section pw-cta">
      <div className="pw-container pw-cta__inner">
        <h2 className="pw-cta__heading">{heading}</h2>
        {body ? <p className="pw-cta__body">{body}</p> : null}
        <div className="pw-cta__actions">
          <CtaLink link={primaryCta} variant="primary" base={base} />
          <CtaLink link={secondaryCta} variant="secondary" base={base} />
        </div>
      </div>
    </section>
  );
}

/**
 * Rewrites root-relative `src`/`href` attributes in a prose HTML fragment to include the site base
 * path, so uploaded images (`/media/…`) and internal links resolve on GitHub Pages *project* sites.
 * Absolute/protocol-relative/anchor URLs are left untouched by {@link withBase}.
 */
function withBaseInHtml(html: string, base?: string): string {
  const b = normalizeBase(base);
  if (b === "/" || !html) return html;
  return html.replace(
    /(\b(?:src|href)=)("|')(\/[^"']*)\2/g,
    (_m, attr: string, quote: string, url: string) => `${attr}${quote}${withBase(base, url)}${quote}`,
  );
}

export function Prose({ html = "", base }: BlockProps<"prose"> & BaseAware) {
  return (
    <section className="pw-section">
      <div
        className="pw-container pw-prose"
        dangerouslySetInnerHTML={{ __html: withBaseInHtml(html, base) }}
      />
    </section>
  );
}

export function GitHubDiscussions({
  repo,
  repoId,
  category,
  categoryId,
  mapping = "pathname",
  term,
  discussionNumber,
  strict = true,
  reactionsEnabled = true,
  inputPosition = "top",
  theme = "preferred_color_scheme",
  lang = "en",
}: BlockProps<"githubDiscussions">) {
  const props: BlockProps<"githubDiscussions"> = {
    repo,
    repoId,
    category,
    categoryId,
    mapping,
    term,
    discussionNumber,
    strict,
    reactionsEnabled,
    inputPosition,
    theme,
    lang,
  };
  const issues = getGitHubDiscussionsConfigIssues(props);
  const discussionHref = REPOSITORY_NAME_PATTERN.test(repo)
    ? `https://github.com/${repo.split("/").map(encodeURIComponent).join("/")}/discussions`
    : "https://giscus.app";

  return (
    <section className="pw-section pw-discussion" aria-label="Discussion">
      <div className="pw-container pw-discussion__inner">
        <div className="pw-discussion__header">
          <div>
            <h2 className="pw-discussion__heading">
              Discussion
            </h2>
            <p className="pw-discussion__intro">
              Read publicly. Sign in with GitHub in the comments panel to join the conversation.
            </p>
          </div>
          <a className="pw-discussion__github" href="https://github.com/login" target="_blank" rel="noreferrer">
            Sign in with GitHub
          </a>
        </div>

        {issues.length > 0 ? (
          <div className="pw-discussion__setup" role="status">
            <strong>Comments are not configured yet.</strong>
            <p>The site owner needs to finish the GitHub Discussions setup in Pagewright.</p>
            <a href="https://giscus.app" target="_blank" rel="noreferrer">
              Open the Giscus setup guide
            </a>
          </div>
        ) : (
          <div className="pw-discussion__embed">
            <div className="pw-discussion__loading" role="status" aria-live="polite">
              <span>Loading discussion</span>
              <i />
              <i />
              <i />
            </div>
            <script
              src="https://giscus.app/client.js"
              data-repo={repo}
              data-repo-id={repoId}
              data-category={category}
              data-category-id={categoryId}
              data-mapping={mapping}
              data-term={
                mapping === "specific"
                  ? term
                  : mapping === "number"
                    ? discussionNumber
                    : undefined
              }
              data-strict={strict ? "1" : "0"}
              data-reactions-enabled={reactionsEnabled ? "1" : "0"}
              data-emit-metadata="0"
              data-input-position={inputPosition}
              data-theme={theme}
              data-lang={lang}
              data-loading="lazy"
              crossOrigin="anonymous"
              async
            />
            <noscript>
              JavaScript is required to load comments. You can{" "}
              <a href={discussionHref}>view the repository discussions on GitHub</a>.
            </noscript>
          </div>
        )}
      </div>
    </section>
  );
}

const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function Footer({
  brand,
  tagline,
  links = [],
  copyright,
  base,
}: BlockProps<"footer"> & BaseAware) {
  return (
    <footer className="pw-footer">
      <div className="pw-container pw-footer__inner">
        <div className="pw-footer__brand">
          {brand ? <strong>{brand}</strong> : null}
          {tagline ? <p className="pw-footer__tagline">{tagline}</p> : null}
        </div>
        <div className="pw-footer__links">
          {links.map((l, i) => (
            <a key={i} className="pw-footer__link" href={withBase(base, l.href)}>
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
  gallery: Gallery,
  cta: Cta,
  prose: Prose,
  githubDiscussions: GitHubDiscussions,
  footer: Footer,
};

/** Formats an ISO date string as a readable date (build-time, locale-stable). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export interface PostCard {
  title: string;
  href: string;
  date: string;
  excerpt?: string;
  cover?: string;
  tags?: string[];
}

/**
 * Renders a grid of blog post cards. Unlike the authored blocks, the post list is *derived* from a
 * repo's posts at build time, so the blog template gathers posts and passes them here directly.
 */
export function PostList({
  heading,
  subheading,
  posts,
  upcoming = [],
  base,
}: {
  heading?: string;
  subheading?: string;
  posts: PostCard[];
  /** Scheduled/draft posts, surfaced as polished "Coming soon" teasers (not yet linkable). */
  upcoming?: PostCard[];
  base?: string;
}) {
  return (
    <section className="pw-section pw-postlist" id="posts">
      <div className="pw-container">
        {heading ? <h2 className="pw-section__heading">{heading}</h2> : null}
        {subheading ? <p className="pw-section__subheading">{subheading}</p> : null}
        {posts.length === 0 ? (
          <div className="pw-postlist__empty">
            <span className="pw-postlist__emptyicon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </span>
            <p className="pw-postlist__emptytitle">Your first story is coming soon</p>
            <p className="pw-postlist__emptybody">
              Write in the editor, hit publish, and your posts land here — deployed automatically.
            </p>
          </div>
        ) : (
          <div className="pw-postlist__grid">
            {posts.map((p, i) => (
              <a key={i} className="pw-postcard" href={withBase(base, p.href)}>
                {p.cover ? (
                  <div className="pw-postcard__media">
                    <img src={withBase(base, p.cover)} alt={p.title} loading="lazy" />
                  </div>
                ) : null}
                <div className="pw-postcard__body">
                  <time className="pw-postcard__date" dateTime={p.date}>
                    {formatDate(p.date)}
                  </time>
                  <h3 className="pw-postcard__title">{p.title}</h3>
                  {p.excerpt ? <p className="pw-postcard__excerpt">{p.excerpt}</p> : null}
                  {p.tags && p.tags.length > 0 ? (
                    <div className="pw-postcard__tags">
                      {p.tags.map((t, ti) => (
                        <span key={ti} className="pw-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        )}
        {upcoming.length > 0 ? (
          <div className="pw-upcoming">
            <h3 className="pw-upcoming__heading">
              <span className="pw-upcoming__dot" aria-hidden="true" />
              Coming soon
            </h3>
            <div className="pw-postlist__grid pw-upcoming__grid">
              {upcoming.map((p, i) => (
                <article key={i} className="pw-postcard pw-postcard--soon" aria-disabled="true">
                  <div className="pw-postcard__body">
                    <span className="pw-postcard__badge">
                      <span className="pw-postcard__badgedot" aria-hidden="true" />
                      Scheduled
                    </span>
                    <h3 className="pw-postcard__title">{p.title}</h3>
                    {p.excerpt ? <p className="pw-postcard__excerpt">{p.excerpt}</p> : null}
                    {p.tags && p.tags.length > 0 ? (
                      <div className="pw-postcard__tags">
                        {p.tags.map((t, ti) => (
                          <span key={ti} className="pw-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Header for a single blog post page (title, date, tags). */
export function PostHeader({
  title,
  date,
  author,
  tags = [],
}: {
  title: string;
  date: string;
  author?: string;
  tags?: string[];
}) {
  return (
    <header className="pw-posthead">
      <div className="pw-container pw-posthead__inner">
        <div className="pw-posthead__meta">
          <time dateTime={date}>{formatDate(date)}</time>
          {author ? <span className="pw-posthead__author">· {author}</span> : null}
        </div>
        <h1 className="pw-posthead__title">{title}</h1>
        {tags.length > 0 ? (
          <div className="pw-posthead__tags">
            {tags.map((t, i) => (
              <span key={i} className="pw-tag">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
