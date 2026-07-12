import type { TemplateId } from "@pagewright/registry";

/**
 * Presentation metadata for the template gallery. This is intentionally separate from the
 * dependency registry (`@pagewright/registry`), which owns the *build bits*. Here we describe how a
 * template looks and reads to a non-technical user choosing one, plus the accent/theme presets they
 * can pick before provisioning.
 */

export type TemplateCategory = "Blog" | "Portfolio" | "Marketing";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
  description: string;
  category: TemplateCategory;
  /** Free-text tags surfaced in search. */
  tags: string[];
  /** Preview card gradient (CSS colors), a lightweight stand-in until real screenshots land. */
  preview: { from: string; to: string };
  highlights: string[];
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "landing",
    name: "Landing Page",
    tagline: "A punchy one-page site to launch anything",
    description:
      "A single-page marketing site with a bold hero, feature grid, and call-to-action — perfect for a product, event, or campaign.",
    category: "Marketing",
    tags: ["marketing", "product", "startup", "one page", "launch"],
    preview: { from: "hsl(250 84% 60%)", to: "hsl(280 80% 62%)" },
    highlights: ["Hero + features", "Call-to-action", "Fast & SEO-ready"],
  },
  {
    id: "blog",
    name: "Blog",
    tagline: "Write in the open and publish from GitHub",
    description:
      "A clean blog with a post index and article pages. Draft posts, schedule publishing, and everything lives in your repo.",
    category: "Blog",
    tags: ["blog", "writing", "articles", "newsletter", "posts"],
    preview: { from: "hsl(200 85% 52%)", to: "hsl(250 84% 60%)" },
    highlights: ["Post index + articles", "Drafts & scheduling", "RSS-ready"],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    tagline: "Show your work with a polished profile",
    description:
      "A personal portfolio to showcase projects, skills, and links. Great for designers, developers, and creatives.",
    category: "Portfolio",
    tags: ["portfolio", "resume", "personal", "projects", "profile"],
    preview: { from: "hsl(33 95% 55%)", to: "hsl(350 80% 60%)" },
    highlights: ["Project showcase", "About + contact", "Personal brand"],
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Marketing",
  "Blog",
  "Portfolio",
];

export function getTemplateMeta(id: TemplateId): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export interface AccentPreset {
  id: string;
  label: string;
  /** HSL for previews in the app. */
  hsl: string;
  /** Hex written into the generated site's `site.json` theme.accent. */
  hex: string;
}

/** Accent presets a user can pick; the first is Pagewright's default brand indigo. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "indigo", label: "Indigo", hsl: "hsl(250 84% 60%)", hex: "#6d4aff" },
  { id: "sky", label: "Sky", hsl: "hsl(200 85% 52%)", hex: "#14a0e6" },
  { id: "emerald", label: "Emerald", hsl: "hsl(160 70% 42%)", hex: "#20b586" },
  { id: "amber", label: "Amber", hsl: "hsl(33 95% 55%)", hex: "#f89a1c" },
  { id: "rose", label: "Rose", hsl: "hsl(347 80% 58%)", hex: "#e8446e" },
  { id: "violet", label: "Violet", hsl: "hsl(280 80% 62%)", hex: "#a24ae8" },
];
