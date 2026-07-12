import { parsePost, type Post } from "@pagewright/blocks";

/**
 * Loads blog posts from `src/data/posts/*.json` at build time. Each post is validated against the
 * shared `postSchema`, so malformed content fails the build loudly. The post `slug` is derived from
 * the filename when not set explicitly.
 */
const modules = import.meta.glob<{ default: unknown }>("../data/posts/*.json", {
  eager: true,
});

export interface LoadedPost extends Post {
  slug: string;
}

export function getAllPosts(): LoadedPost[] {
  return Object.entries(modules).map(([path, mod]) => {
    const post = parsePost(mod.default);
    const file = path.split("/").pop()!.replace(/\.json$/, "");
    const slug = post.slug && post.slug !== "/" ? post.slug.replace(/^\/+/, "") : file;
    return { ...post, slug };
  });
}

/** Published posts (not draft, and `publishAt` in the past), newest first. */
export function getPublishedPosts(now: Date = new Date()): LoadedPost[] {
  return getAllPosts()
    .filter((p) => !p.draft && (!p.publishAt || new Date(p.publishAt) <= now))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
