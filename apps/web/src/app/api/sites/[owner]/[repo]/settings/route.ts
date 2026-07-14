import { siteSettingsSchema } from "@pagewright/blocks";
import { ConcurrencyError } from "@pagewright/github";
import { getProviderForSession } from "@/lib/auth/provider";
import { GLOBAL_FEATURES_RUNTIME_PATH } from "@/lib/site-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_SETTINGS_PATH = "src/data/site.json";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { settings?: unknown; expectedHeadSha?: unknown; force?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = siteSettingsSchema.safeParse(body.settings);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid site settings." },
      { status: 422 },
    );
  }

  const force = body.force === true;
  const expectedHeadSha =
    !force && typeof body.expectedHeadSha === "string" && body.expectedHeadSha
      ? body.expectedHeadSha
      : undefined;
  if (!force && !expectedHeadSha) {
    return Response.json(
      { error: "The repository version is required to save settings safely." },
      { status: 400 },
    );
  }
  const { owner, repo } = await params;
  const ref = { owner, repo };
  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  try {
    const runtimeFile = await provider.getFile(
      ref,
      GLOBAL_FEATURES_RUNTIME_PATH,
      expectedHeadSha ?? repoData.defaultBranch,
    );
    if (!runtimeFile) {
      return Response.json(
        {
          error:
            "This site’s generated runtime must be updated before it can save global settings.",
          code: "runtime_update_required",
        },
        { status: 422 },
      );
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to verify the site runtime." },
      { status: 502 },
    );
  }

  try {
    const result = await provider.commitFiles(
      ref,
      {
        message: "Update site settings via Pagewright",
        files: [
          {
            path: SITE_SETTINGS_PATH,
            content: `${JSON.stringify(parsed.data, null, 2)}\n`,
          },
        ],
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
            "This site changed somewhere else since you opened settings. Reload to get the latest, or overwrite with your version.",
          code: "conflict",
          actualHeadSha: error.actualHeadSha,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save site settings." },
      { status: 502 },
    );
  }
}
