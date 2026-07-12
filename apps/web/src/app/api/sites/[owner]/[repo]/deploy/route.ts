import { getProviderForSession } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEPLOY_WORKFLOW_FILE = "deploy.yml";

/**
 * Re-trigger a site's deploy. Used by the "Retry deploy" / "Redeploy" action in the progress view.
 *
 * Fires a `workflow_dispatch` against the generated `deploy.yml` on the repo's default branch. In
 * mock mode this seeds a fresh simulated run; on real GitHub it queues a new Pages build. The
 * client re-polls the deploy-status endpoint afterward to pick up the new run.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;

  const repoData = await provider.getRepo({ owner, repo }).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  try {
    await provider.dispatchWorkflow(
      { owner, repo },
      DEPLOY_WORKFLOW_FILE,
      repoData.defaultBranch,
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to trigger a deploy.",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
