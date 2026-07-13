import { getProviderForSession } from "@/lib/auth/provider";
import { ConcurrencyError } from "@pagewright/github";
import {
  isPostPath,
  postPathForSlug,
  slugify,
  starterPostDoc,
} from "@/lib/content/posts";
import { renderMarkdown } from "@/lib/content/markdown";
import type { Post } from "@pagewright/blocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Post lifecycle operations that aren't a plain content-save:
 *   - POST creates a new post from a title (slugified → starter draft doc), guarding against
 *     clobbering an existing slug.
 *   - DELETE removes a post document in a single commit.
 * Editing an existing post's body/metadata goes through the shared `…/pages` save endpoint. Every
 * write pushes to the default branch and triggers the site's deploy workflow.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let body: { title?: unknown; slug?: unknown };
  try {
    body = (await request.json()) as { title?: unknown; slug?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "A post title is required." }, { status: 400 });
  }
  const slug = slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : title);
  const path = postPathForSlug(slug);

  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  // Don't overwrite an existing post that happens to slugify the same way.
  const existing = await provider.getFile({ owner, repo }, path).catch(() => null);
  if (existing) {
    return Response.json(
      {
        error: `A post with the slug “${slug}” already exists. Pick a different title.`,
        code: "exists",
        slug,
      },
      { status: 409 },
    );
  }

  // Render the starter markdown to HTML server-side so the very first deploy shows real content
  // instead of a blank body (the Astro template outputs the stored `html` directly).
  const starter = starterPostDoc(title, slug);
  const doc: Post = {
    ...starter,
    blocks: starter.blocks.map((b) =>
      b.type === "prose"
        ? { ...b, props: { ...b.props, html: renderMarkdown(b.props.markdown ?? "") } }
        : b,
    ),
  };
  const content = `${JSON.stringify(doc, null, 2)}\n`;
  try {
    const result = await provider.commitFiles(
      { owner, repo },
      {
        message: `Create post ${slug}.json via Pagewright`,
        files: [{ path, content }],
        branch: repoData.defaultBranch,
      },
    );
    return Response.json({ ok: true, slug, path, headSha: result.sha, commitUrl: result.htmlUrl });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create the post." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let body: { path?: unknown; expectedHeadSha?: unknown };
  try {
    body = (await request.json()) as { path?: unknown; expectedHeadSha?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  if (!isPostPath(path)) {
    return Response.json({ error: "Unsupported post path." }, { status: 400 });
  }
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" && body.expectedHeadSha
      ? body.expectedHeadSha
      : undefined;

  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  const fileName = path.split("/").pop() ?? path;
  try {
    const result = await provider.commitFiles(
      { owner, repo },
      {
        message: `Delete post ${fileName} via Pagewright`,
        files: [],
        deletions: [path],
        branch: repoData.defaultBranch,
        expectedHeadSha,
      },
    );
    return Response.json({ ok: true, headSha: result.sha, commitUrl: result.htmlUrl });
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return Response.json(
        {
          error: "This site changed since the list loaded. Refresh and try again.",
          code: "conflict",
          actualHeadSha: error.actualHeadSha,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete the post." },
      { status: 502 },
    );
  }
}
