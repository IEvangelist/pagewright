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
    html: z.string().default(""),
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
  footerBlockSchema,
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockProps<T extends BlockType> = Extract<Block, { type: T }>["props"];

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
export const postSchema = pageSchema.extend({
  date: z.string(),
  excerpt: z.string().optional(),
  cover: z.string().optional(),
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),
});
export type Post = z.infer<typeof postSchema>;

export const siteConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  defaultTheme: z.enum(["light", "dark", "system"]).default("system"),
  socials: z.array(linkSchema).default([]),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;

/** Parse + apply defaults for an unknown page document (used when reading repo content). */
export function parsePage(input: unknown): Page {
  return pageSchema.parse(input);
}

/** Parse + apply defaults for an unknown blog post document. */
export function parsePost(input: unknown): Post {
  return postSchema.parse(input);
}
