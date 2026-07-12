import { getProviderForSession } from "@/lib/auth/provider";
import { getDeployStatus } from "@/lib/deploy/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Point-in-time deploy snapshot for a site (repo + Pages + latest run + its job steps). The client
 * `DeployProgress` polls this while a deployment is in flight and stops once it reaches a terminal
 * phase. Reads only — the redeploy action lives at the sibling `deploy` route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;

  let status;
  try {
    status = await getDeployStatus(provider, { owner, repo });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load deploy status.",
      },
      { status: 502 },
    );
  }

  if (!status) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  return Response.json(status, {
    headers: { "cache-control": "no-store" },
  });
}
