import { getProviderForSession } from "@/lib/auth/provider";
import { parsePage, type Page } from "@pagewright/blocks";
import { puckDataToPage } from "@/lib/builder/convert";
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
 * Persist an edited page. Converts the editor's Puck `Data` back into a `Page`, merges it onto the
 * document currently in the repo (so untouched fields like slug/draft/publishAt survive), validates
 * with Zod, and commits the JSON — which pushes to the default branch and triggers the deploy
 * workflow. Last-write-wins for now; SHA-based conflict handling lands with the persistence step.
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

  let body: { path?: unknown; data?: unknown };
  try {
    body = (await request.json()) as { path?: unknown; data?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  if (!isAllowedPath(path)) {
    return Response.json({ error: "Unsupported content path." }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return Response.json({ error: "Missing editor data." }, { status: 400 });
  }

  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  // Load the existing document to preserve fields the editor doesn't manage.
  let base: Page;
  const existing = await provider.getFile({ owner, repo }, path).catch(() => null);
  try {
    base = existing
      ? parsePage(JSON.parse(existing.content))
      : parsePage({ title: repoData.name, blocks: [] });
  } catch {
    base = parsePage({ title: repoData.name, blocks: [] });
  }

  let page: Page;
  try {
    page = parsePage(puckDataToPage(body.data as Data, base));
  } catch {
    return Response.json(
      { error: "Some blocks are missing required fields. Fix them and try again." },
      { status: 422 },
    );
  }

  const content = `${JSON.stringify(page, null, 2)}\n`;
  const fileName = path.split("/").pop() ?? path;

  try {
    const result = await provider.commitFiles(
      { owner, repo },
      {
        message: `Update ${fileName} via Pagewright`,
        files: [{ path, content }],
        branch: repoData.defaultBranch,
      },
    );
    return Response.json({ ok: true, sha: result.sha, commitUrl: result.htmlUrl });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save changes." },
      { status: 502 },
    );
  }
}
