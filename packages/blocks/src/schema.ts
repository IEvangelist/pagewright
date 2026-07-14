import { z } from "zod";

/**
 * Pagewright content model.
 *
 * A page is an ordered list of typed blocks. This schema is the single source of
 * truth shared by the visual builder (Next.js) and the generated Astro sites, so
 * both render identical output and content is safe to migrate over time.
 */

export const linkSchema = z.object({
  label: z.string(),
  href: z.string(),
  icon: z.string().optional(),
});
export type Link = z.infer<typeof linkSchema>;

export const navbarBlockSchema = z.object({
  type: z.literal("navbar"),
  id: z.string(),
  props: z.object({
    brand: z.string(),
    logo: z.string().optional(),
    links: z.array(linkSchema).default([]),
    cta: linkSchema.optional(),
  }),
});

export const heroBlockSchema = z.object({
  type: z.literal("hero"),
  id: z.string(),
  props: z.object({
    eyebrow: z.string().optional(),
    heading: z.string(),
    subheading: z.string().optional(),
    primaryCta: linkSchema.optional(),
    secondaryCta: linkSchema.optional(),
    image: z.string().optional(),
    align: z.enum(["left", "center"]).default("center"),
  }),
});

export const featureItemSchema = z.object({
  /** Named icon from the shared block icon set (see `blockIcons`), e.g. "rocket". */
  icon: z.string().optional(),
  title: z.string(),
  body: z.string(),
});
export type FeatureItem = z.infer<typeof featureItemSchema>;

export const featuresBlockSchema = z.object({
  type: z.literal("features"),
  id: z.string(),
  props: z.object({
    heading: z.string().optional(),
    subheading: z.string().optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z.array(featureItemSchema).default([]),
  }),
});

export const ctaBlockSchema = z.object({
  type: z.literal("cta"),
  id: z.string(),
  props: z.object({
    heading: z.string(),
    body: z.string().optional(),
    primaryCta: linkSchema.optional(),
    secondaryCta: linkSchema.optional(),
  }),
});

export const proseBlockSchema = z.object({
  type: z.literal("prose"),
  id: z.string(),
  props: z.object({
    /** Markdown source (canonical for posts). Rendered to `html` at save time. */
    markdown: z.string().optional(),
    /** Rendered HTML the Astro template outputs directly (kept in sync with `markdown`). */
    html: z.string().default(""),
  }),
});

export const githubDiscussionsBlockSchema = z.object({
  type: z.literal("githubDiscussions"),
  id: z.string(),
  props: z.object({
    repo: z.string().default(""),
    repoId: z.string().default(""),
    category: z.string().default(""),
    categoryId: z.string().default(""),
    mapping: z
      .enum(["pathname", "url", "title", "og:title", "specific", "number"])
      .default("pathname"),
    term: z.string().optional(),
    discussionNumber: z.number().int().positive().optional(),
    strict: z.boolean().default(true),
    reactionsEnabled: z.boolean().default(true),
    inputPosition: z.enum(["top", "bottom"]).default("top"),
    theme: z.enum(["preferred_color_scheme", "light", "dark", "dark_dimmed"]).default("preferred_color_scheme"),
    lang: z.string().default("en"),
  }),
});

export const footerBlockSchema = z.object({
  type: z.literal("footer"),
  id: z.string(),
  props: z.object({
    brand: z.string().optional(),
    tagline: z.string().optional(),
    links: z.array(linkSchema).default([]),
    copyright: z.string().optional(),
  }),
});

export const galleryItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  href: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

export const galleryBlockSchema = z.object({
  type: z.literal("gallery"),
  id: z.string(),
  props: z.object({
    heading: z.string().optional(),
    subheading: z.string().optional(),
    columns: z.union([z.literal(2), z.literal(3)]).default(3),
    items: z.array(galleryItemSchema).default([]),
  }),
});

export const blockSchema = z.discriminatedUnion("type", [
  navbarBlockSchema,
  heroBlockSchema,
  featuresBlockSchema,
  galleryBlockSchema,
  ctaBlockSchema,
  proseBlockSchema,
  githubDiscussionsBlockSchema,
  footerBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockProps<T extends BlockType> = Extract<Block, { type: T }>["props"];

export const postComponentSchema = z.discriminatedUnion("type", [
  proseBlockSchema,
  githubDiscussionsBlockSchema,
]);
export type PostComponent = z.infer<typeof postComponentSchema>;
export type PostComponentType = PostComponent["type"];
export const postComponentsSchema = z.array(postComponentSchema).superRefine((components, context) => {
  if (components.filter((component) => component.type === "githubDiscussions").length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A post can contain only one GitHub Discussions component.",
    });
  }
});

export const pageSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  slug: z.string().default("/"),
  draft: z.boolean().default(false),
  publishAt: z.string().datetime().optional(),
  blocks: z.array(blockSchema).default([]),
});
export type Page = z.infer<typeof pageSchema>;

/**
 * A blog post is a page document plus blog front-matter (date, excerpt, cover, tags, author).
 * Shared by the builder, the generated Astro blog template, and the scheduled-publish workflow.
 */
export const postSchema = pageSchema
  .extend({
    date: z.string(),
    excerpt: z.string().optional(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
  })
  .superRefine((post, context) => {
    if (post.blocks.filter((block) => block.type === "githubDiscussions").length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocks"],
        message: "A post can contain only one GitHub Discussions component.",
      });
    }
  });
export type Post = z.infer<typeof postSchema>;

function isCanonicalHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isExternalHref(value: string): boolean {
  if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return isCanonicalHttpUrl(value);
    }
    return (
      (url.protocol === "mailto:" || url.protocol === "tel:") &&
      url.pathname.trim().length > 0
    );
  } catch {
    return false;
  }
}

const externalHrefSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isExternalHref, "Enter a full http(s), mailto, or tel URL.");

const canonicalSiteUrlSchema = z
  .string()
  .trim()
  .refine((value) => !value || isCanonicalHttpUrl(value), "Enter a full http(s) URL.");

export const siteLinkSchema = linkSchema.extend({
  label: z.string().trim().min(1),
  href: externalHrefSchema,
}).passthrough();
export type SiteLink = z.infer<typeof siteLinkSchema>;

/**
 * Site-wide details and external links. `socials` is accepted as a legacy alias so sites generated
 * before global settings existed migrate to `links` the next time they are saved.
 */
export const siteConfigSchema = z
  .object({
    // Reads stay tolerant of legacy files; the settings write schema below applies stricter rules.
    name: z.string(),
    description: z.string().optional(),
    url: z.string().optional(),
    defaultTheme: z.enum(["light", "dark", "system"]).default("system"),
    links: z.array(siteLinkSchema).optional(),
    socials: z.array(linkSchema.passthrough()).optional(),
  })
  .passthrough()
  .transform(({ socials, links, ...config }) => ({
    ...config,
    links: links ?? socials ?? [],
  }));
export type SiteConfig = z.infer<typeof siteConfigSchema>;

const persistedSiteSettingsSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
    url: canonicalSiteUrlSchema.optional(),
    defaultTheme: z.enum(["light", "dark", "system"]).default("system"),
    links: z.array(siteLinkSchema).default([]),
  })
  .passthrough();

/** Validate settings submitted by the app after applying legacy read migrations. */
export const siteSettingsSchema = siteConfigSchema.pipe(persistedSiteSettingsSchema);

/** Parse + apply defaults for an unknown page document (used when reading repo content). */
export function parsePage(input: unknown): Page {
  return pageSchema.parse(input);
}

/** Parse + apply defaults for an unknown blog post document. */
export function parsePost(input: unknown): Post {
  return postSchema.parse(input);
}

/** Parse + apply defaults and legacy migrations for an unknown site settings document. */
export function parseSiteConfig(input: unknown): SiteConfig {
  return siteConfigSchema.parse(input);
}
