import { parsePost, type Post } from "@pagewright/blocks";

/**
 * Shared helpers for blog-post authoring: where posts live, how titles become slugs/filenames, the
 * starter document a new post begins as, the client-editable metadata shape, and how that metadata
 * is merged back onto a post document. Kept free of server-only imports so both the API routes and
 * the (client) editor can use the same types and logic.
 */

export const POSTS_DIR = "src/data/posts";

/** True when a content path is a blog post document under the posts data directory. */
export function isPostPath(path: string): boolean {
  return /^src\/data\/posts\/[A-Za-z0-9._-]+\.json$/.test(path) && !path.includes("..");
}

export function postPathForSlug(slug: string): string {
  return `${POSTS_DIR}/${slug}.json`;
}

/** Derive the slug portion (filename without .json) from a post path. */
export function slugFromPostPath(path: string): string {
  return path.split("/").pop()?.replace(/\.json$/, "") ?? "";
}

/** Turn a human title into a URL/file-safe slug. Falls back to a timestamped slug when empty. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || `post-${Date.now().toString(36)}`;
}

/**
 * The client-editable metadata for a post. Title/description are edited in the visual builder's root
 * props; these are the blog-specific front-matter fields shown in the editor's "Post details" panel.
 * All strings so they map cleanly onto form inputs; the server normalizes empties to omitted.
 */
export interface PostMeta {
  date: string;
  excerpt: string;
  tags: string[];
  author: string;
  cover: string;
  draft: boolean;
  publishAt: string;
}

/** Extract the editable metadata from a parsed post (for seeding the editor's details panel). */
export function postToMeta(post: Post): PostMeta {
  return {
    date: post.date ?? "",
    excerpt: post.excerpt ?? "",
    tags: post.tags ?? [],
    author: post.author ?? "",
    cover: post.cover ?? "",
    draft: post.draft ?? false,
    publishAt: post.publishAt ?? "",
  };
}

/**
 * Fold client-supplied metadata back onto a post document. Empty optional strings become omitted so
 * the JSON stays clean; `date` always keeps a value (falls back to the base doc or now).
 */
export function applyPostMeta(base: Post, meta: Partial<PostMeta> | undefined): Post {
  const next: Post = { ...base };
  if (!meta) return next;

  if (typeof meta.date === "string" && meta.date.trim()) next.date = meta.date;
  next.draft = Boolean(meta.draft);

  const setOrDrop = (key: "excerpt" | "author" | "cover", value: unknown) => {
    if (typeof value === "string" && value.trim()) next[key] = value;
    else delete next[key];
  };
  setOrDrop("excerpt", meta.excerpt);
  setOrDrop("author", meta.author);
  setOrDrop("cover", meta.cover);

  if (Array.isArray(meta.tags)) {
    next.tags = meta.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  if (typeof meta.publishAt === "string" && meta.publishAt.trim()) {
    next.publishAt = meta.publishAt;
  } else {
    delete next.publishAt;
  }

  if (!next.date) next.date = new Date().toISOString();
  return next;
}

/** The document a freshly created post starts as: a draft with today's date and one prose block. */
export function starterPostDoc(title: string, slug: string): Post {
  const doc = {
    title: title.trim() || "Untitled post",
    description: "",
    slug,
    draft: true,
    date: new Date().toISOString(),
    excerpt: "",
    tags: [] as string[],
    blocks: [
      {
        type: "prose",
        id: `prose-${Date.now().toString(36)}`,
        props: {
          markdown: `# ${title.trim() || "Untitled post"}\n\nStart writing your post here…`,
        },
      },
    ],
  };
  return parsePost(doc);
}

export type PostStatusTone = "published" | "scheduled" | "draft";

export interface PostStatus {
  tone: PostStatusTone;
  label: string;
}

/**
 * Classify a post the way the deployed blog does: drafts are hidden, a future `publishAt` is
 * scheduled, everything else is live.
 */
export function derivePostStatus(post: Post, now: number = Date.now()): PostStatus {
  if (post.draft) return { tone: "draft", label: "Draft" };
  if (post.publishAt) {
    const at = Date.parse(post.publishAt);
    if (Number.isFinite(at) && at > now) return { tone: "scheduled", label: "Scheduled" };
  }
  return { tone: "published", label: "Published" };
}
