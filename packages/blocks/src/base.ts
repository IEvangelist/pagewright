/**
 * Base-path awareness for generated sites.
 *
 * GitHub Pages *project* sites are served from `/<repo>/`, so a root-relative asset like an uploaded
 * image (`/media/logo.png`) or an internal link (`/blog/hello/`) would 404 unless it is prefixed with
 * the site's base path. Astro exposes that value as `import.meta.env.BASE_URL` (always `/`-terminated,
 * e.g. `/my-repo/` or `/`), which the templates thread into {@link PageRenderer} via the `base` prop.
 * The Next.js builder preview renders from the app origin, so it simply uses the default base of `/`.
 *
 * These are plain functions (no React context) so the block components stay renderable as React
 * Server Components in the Next.js app and as static islands in Astro — `base` is threaded as an
 * explicit prop rather than through context, which RSC does not support.
 */

/** Extra prop carried by every block component so it can resolve root-relative URLs. */
export interface BaseAware {
  /** Site base path (e.g. `/my-repo/`). Defaults to `/`. */
  base?: string;
}

/** Normalize any incoming base to a leading+trailing-slashed path (or `/`). */
export function normalizeBase(base?: string | null): string {
  if (!base) return "/";
  let b = base.trim();
  if (b === "" || b === "/") return "/";
  if (!b.startsWith("/")) b = `/${b}`;
  if (!b.endsWith("/")) b = `${b}/`;
  return b;
}

/**
 * Prefix a root-relative internal URL with the site base path. Absolute URLs (`http(s)://`),
 * protocol-relative (`//cdn`), anchors (`#`), scheme URLs (`mailto:`, `tel:`, `data:`), and already
 * relative paths are returned untouched so they never get double-prefixed.
 */
export function withBase(base: string | undefined, url?: string): string | undefined {
  if (!url) return url;
  // Only root-relative internal paths get rewritten.
  if (!url.startsWith("/")) return url;
  if (url.startsWith("//")) return url;
  const b = normalizeBase(base);
  if (b === "/") return url;
  return `${b.replace(/\/$/, "")}${url}`;
}
