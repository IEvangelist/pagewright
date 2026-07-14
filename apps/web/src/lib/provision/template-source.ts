import "server-only";
import type { CommitFile } from "@pagewright/github";
import type { TemplateId } from "@pagewright/registry";
import {
  parsePage,
  parsePost,
  parseSiteConfig,
  type Block,
  type SiteConfig,
} from "@pagewright/blocks";
import bundle from "./provision-bundle.generated.json";

/**
 * Template + vendored-package sources for provisioning, read from a build-time generated bundle
 * (see `scripts/build-provision-bundle.mjs`) rather than the monorepo filesystem.
 *
 * Reading from an imported JSON module — instead of walking `templates/` on disk — is what lets
 * provisioning work in a serverless deployment (Netlify), where the monorepo source tree is not
 * present next to the function. The bundle is regenerated before every `dev`/`build`, so it always
 * reflects the current templates and `@pagewright/*` sources.
 */

interface ProvisionBundle {
  templates: Record<string, CommitFile[]>;
  vendor: CommitFile[];
}

const typedBundle = bundle as unknown as ProvisionBundle;

/** Copy so callers can freely transform files without mutating the shared bundle. */
function clone(files: CommitFile[]): CommitFile[] {
  return files.map((file) => ({ ...file }));
}

/** Load every source file for a template as commit-ready entries (repo-relative paths, utf-8). */
export function loadTemplateFiles(templateId: TemplateId): CommitFile[] {
  const files = typedBundle.templates[templateId];
  if (!files) {
    throw new Error(
      `Template "${templateId}" is not present in the provision bundle. ` +
        `Re-run scripts/build-provision-bundle.mjs.`,
    );
  }
  return clone(files);
}

/**
 * The vendored `@pagewright/*` package sources committed into every generated repo under `vendor/`.
 * Generated repos reference them with `file:` dependencies + `vite.ssr.noExternal`, so a plain
 * `npm install` + `astro build` resolves and transpiles them with no npm publishing required.
 */
export function loadVendorFiles(): CommitFile[] {
  return clone(typedBundle.vendor);
}

/**
 * The parsed home-page blocks for a template, used to render a live at-scale preview in the template
 * gallery (the same block components the deployed Astro site uses). Returns an empty array if the
 * template has no parseable home page, so callers can fall back to a gradient placeholder.
 */
export function loadTemplateHomeBlocks(templateId: TemplateId): Block[] {
  const files = typedBundle.templates[templateId];
  if (!files) return [];
  const home = files.find((file) => file.path.endsWith("src/data/pages/home.json"));
  if (!home || typeof home.content !== "string") return [];
  try {
    return parsePage(JSON.parse(home.content)).blocks;
  } catch {
    return [];
  }
}

/**
 * A blog post reduced to what the demo renderer needs — its card metadata plus the body blocks so
 * an individual article can be rendered in the isolated preview frame.
 */
export interface DemoPost {
  slug: string;
  title: string;
  description?: string;
  date: string;
  publishAt?: string;
  draft: boolean;
  excerpt?: string;
  cover?: string;
  tags: string[];
  author?: string;
  blocks: Block[];
}

function fileSlug(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.json$/, "");
}

function loadAllPosts(templateId: TemplateId): DemoPost[] {
  const files = typedBundle.templates[templateId];
  if (!files) return [];
  const out: DemoPost[] = [];
  for (const file of files) {
    if (!/src\/data\/posts\/.+\.json$/.test(file.path) || typeof file.content !== "string") continue;
    try {
      const post = parsePost(JSON.parse(file.content));
      const slug = post.slug && post.slug !== "/" ? post.slug.replace(/^\/+/, "") : fileSlug(file.path);
      out.push({
        slug,
        title: post.title,
        description: post.description,
        date: post.date,
        publishAt: post.publishAt,
        draft: post.draft,
        excerpt: post.excerpt,
        cover: post.cover,
        tags: post.tags,
        author: post.author,
        blocks: post.blocks,
      });
    } catch {
      // Skip malformed sample posts rather than breaking the whole demo.
    }
  }
  return out;
}

/**
 * Split a template's sample posts into published (visible, newest first) and upcoming (scheduled for
 * a future `publishAt`, soonest first) — mirroring the generated blog's `getPublishedPosts` /
 * `getUpcomingPosts` so the demo shows exactly what a deployed site would.
 */
export function loadTemplatePosts(
  templateId: TemplateId,
  now: Date = new Date(),
): { published: DemoPost[]; upcoming: DemoPost[] } {
  const all = loadAllPosts(templateId);
  const published = all
    .filter((p) => !p.draft && (!p.publishAt || new Date(p.publishAt) <= now))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const upcoming = all
    .filter((p) => p.publishAt != null && new Date(p.publishAt) > now)
    .sort((a, b) => new Date(a.publishAt!).getTime() - new Date(b.publishAt!).getTime());
  return { published, upcoming };
}

/** Look up a single sample post by slug (for rendering an article view in the demo frame). */
export function loadTemplatePost(templateId: TemplateId, slug: string): DemoPost | undefined {
  return loadAllPosts(templateId).find((p) => p.slug === slug);
}

/** The site config shipped with a template, used by demos and global-value bindings. */
export function loadTemplateSite(templateId: TemplateId): SiteConfig | null {
  const files = typedBundle.templates[templateId];
  const site = files?.find((file) => file.path.endsWith("src/data/site.json"));
  if (!site || typeof site.content !== "string") return null;
  try {
    return parseSiteConfig(JSON.parse(site.content));
  } catch {
    return null;
  }
}

/**
 * The raw block stylesheet (`@pagewright/blocks/blocks.css`), read from the vendored bundle so it can
 * be inlined into the fully isolated demo preview iframe — giving a pixel-identical rendering to a
 * deployed Astro site with no dependency on the app's own global styles.
 */
export function loadBlocksCss(): string {
  const file = typedBundle.vendor.find((f) => f.path.endsWith("styles/blocks.css"));
  return file && typeof file.content === "string" ? file.content : "";
}
