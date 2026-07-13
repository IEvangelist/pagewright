import "server-only";
import { parsePost, type Post } from "@pagewright/blocks";
import type { GitHubProvider, RepoRef } from "@pagewright/github";
import { POSTS_DIR, slugFromPostPath } from "./posts";

export interface PostSummary {
  slug: string;
  path: string;
  post: Post;
}

/**
 * List every blog post in a repo. Enumerates the posts data directory, then reads and parses each
 * document in parallel. Files that fail to parse are skipped rather than failing the whole list.
 * Results are sorted newest-first by the post's `date`.
 */
export async function listPosts(provider: GitHubProvider, ref: RepoRef): Promise<PostSummary[]> {
  const entries = await provider.listDirectory(ref, POSTS_DIR).catch(() => []);
  const jsonFiles = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));

  const summaries = await Promise.all(
    jsonFiles.map(async (entry): Promise<PostSummary | null> => {
      const file = await provider.getFile(ref, entry.path).catch(() => null);
      if (!file) return null;
      try {
        return { slug: slugFromPostPath(entry.path), path: entry.path, post: parsePost(JSON.parse(file.content)) };
      } catch {
        return null;
      }
    }),
  );

  return summaries
    .filter((s): s is PostSummary => s !== null)
    .sort((a, b) => (b.post.date ?? "").localeCompare(a.post.date ?? ""));
}
