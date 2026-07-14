import { getProviderForSession } from "@/lib/auth/provider";
import {
  parsePage,
  parsePost,
  postComponentsSchema,
  type Page,
  type Post,
  type PostComponent,
} from "@pagewright/blocks";
import { ConcurrencyError } from "@pagewright/github";
import { puckDataToPage } from "@/lib/builder/convert";
import { applyPostMeta, isPostPath, type PostMeta } from "@/lib/content/posts";
import { renderMarkdown } from "@/lib/content/markdown";
import { loadVendorFiles } from "@/lib/provision/template-source";
import { createStamp, getLatestManifest } from "@pagewright/registry";
import type { Data } from "@measured/puck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Only page/post documents under the content data dir may be written through this endpoint. */
function isAllowedPath(path: string): boolean {
  return (
    /^src\/data\/(pages|posts)\/[A-Za-z0-9._-]+\.json$/.test(path) && !path.includes("..")
  );
}

/**
 * Build a post document from markdown: the body becomes a single prose block carrying the markdown
 * source plus its rendered HTML (what the Astro template outputs). Any existing prose block id is
 * reused so diffs stay small, and the client metadata is folded on top.
 */
function postFromMarkdown(
  base: Post,
  markdown: string,
  meta: Partial<PostMeta> | undefined,
  root: { title?: string; description?: string },
): Post {
  const existingProse = base.blocks.find((b) => b.type === "prose");
  const id = existingProse?.id ?? `prose-${Date.now().toString(36)}`;
  const proseBlock: Extract<PostComponent, { type: "prose" }> = {
    type: "prose",
    id,
    props: { markdown, html: renderMarkdown(markdown) },
  };
  const withBody: Post = { ...base, blocks: [proseBlock] };
  if (typeof root.title === "string" && root.title.trim()) withBody.title = root.title.trim();
  if (typeof root.description === "string") withBody.description = root.description;
  return parsePost(applyPostMeta(withBody, meta));
}

/** Validate ordered post components and render each Markdown source to deployable HTML. */
function postFromComponents(
  base: Post,
  input: unknown[],
  meta: Partial<PostMeta> | undefined,
  root: { title?: string; description?: string },
): Post {
  const blocks = postComponentsSchema.parse(input).map((component) =>
    component.type === "prose"
      ? {
          ...component,
          props: {
            ...component.props,
            html: renderMarkdown(component.props.markdown ?? ""),
          },
        }
      : component,
  );
  const withBody: Post = { ...base, blocks };
  if (typeof root.title === "string" && root.title.trim()) withBody.title = root.title.trim();
  if (typeof root.description === "string") withBody.description = root.description;
  return parsePost(applyPostMeta(withBody, meta));
}

/**
 * Persist an edited page. Converts the editor's Puck `Data` back into a `Page`, merges it onto the
 * document currently in the repo (so untouched fields like slug/draft/publishAt survive), validates
 * with Zod, and commits the JSON — which pushes to the default branch and triggers the deploy
 * workflow.
 *
 * Concurrency: when the client sends the branch `expectedHeadSha` it captured when the editor loaded,
 * the commit is guarded so it only applies if the branch hasn't moved underneath. If it has (the repo
 * changed elsewhere since the edit began) we return 409 so the client can offer overwrite/reload
 * instead of silently clobbering newer work. The response always includes the new `headSha` so the
 * editor can keep saving without reloading.
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

  let body: {
    path?: unknown;
    data?: unknown;
    markdown?: unknown;
    blocks?: unknown;
    title?: unknown;
    description?: unknown;
    meta?: unknown;
    expectedHeadSha?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  if (!isAllowedPath(path)) {
    return Response.json({ error: "Unsupported content path." }, { status: 400 });
  }
  const isPost = isPostPath(path);
  const componentBody = isPost && Array.isArray(body.blocks) ? body.blocks : null;
  const markdownBody = isPost && typeof body.markdown === "string" ? body.markdown : null;
  if (
    componentBody === null &&
    markdownBody === null &&
    (!body.data || typeof body.data !== "object")
  ) {
    return Response.json({ error: "Missing editor data." }, { status: 400 });
  }
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" && body.expectedHeadSha
      ? body.expectedHeadSha
      : undefined;
  const meta =
    isPost && body.meta && typeof body.meta === "object"
      ? (body.meta as Partial<PostMeta>)
      : undefined;

  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  // Load the existing document to preserve fields the editor doesn't manage.
  const existing = await provider.getFile({ owner, repo }, path).catch(() => null);

  let document: Page | Post;
  try {
    if (isPost) {
      // Posts carry front-matter (date/excerpt/tags/…) that plain page parsing would strip, so parse
      // the base as a post, fold the edited body onto it, then merge the client-supplied metadata.
      let base: Post;
      try {
        base = parsePost(existing ? JSON.parse(existing.content) : { title: repoData.name, blocks: [] });
      } catch {
        base = parsePost({ title: repoData.name, blocks: [] });
      }
      if (componentBody !== null) {
        document = postFromComponents(base, componentBody, meta, {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
        });
      } else if (markdownBody !== null) {
        document = postFromMarkdown(base, markdownBody, meta, {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
        });
      } else {
        const withBody = puckDataToPage(body.data as Data, base) as Post;
        document = parsePost(applyPostMeta(withBody, meta));
      }
    } else {
      let base: Page;
      try {
        base = existing
          ? parsePage(JSON.parse(existing.content))
          : parsePage({ title: repoData.name, blocks: [] });
      } catch {
        base = parsePage({ title: repoData.name, blocks: [] });
      }
      document = parsePage(puckDataToPage(body.data as Data, base));
    }
  } catch {
    return Response.json(
      { error: "Some blocks are missing required fields. Fix them and try again." },
      { status: 422 },
    );
  }

  const content = `${JSON.stringify(document, null, 2)}\n`;
  const fileName = path.split("/").pop() ?? path;
  const files = [{ path, content }];
  if (isPost && document.blocks.some((block) => block.type === "githubDiscussions")) {
    const manifest = getLatestManifest("blog");
    if (!manifest) {
      return Response.json({ error: "The blog runtime is not available." }, { status: 503 });
    }
    files.push(
      ...loadVendorFiles()
        .filter((file) => file.path.startsWith("vendor/pagewright-blocks/"))
        .map((file) => ({ path: file.path, content: file.content })),
      {
        path: "pagewright.json",
        content: `${JSON.stringify(createStamp(manifest), null, 2)}\n`,
      },
    );
  }

  try {
    const result = await provider.commitFiles(
      { owner, repo },
      {
        message: `Update ${fileName} via Pagewright`,
        files,
        branch: repoData.defaultBranch,
        expectedHeadSha,
      },
    );
    return Response.json({
      ok: true,
      sha: result.sha,
      headSha: result.sha,
      commitUrl: result.htmlUrl,
    });
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return Response.json(
        {
          error:
            "This site changed somewhere else since you started editing. Reload to get the latest, or overwrite with your version.",
          code: "conflict",
          actualHeadSha: error.actualHeadSha,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save changes." },
      { status: 502 },
    );
  }
}
