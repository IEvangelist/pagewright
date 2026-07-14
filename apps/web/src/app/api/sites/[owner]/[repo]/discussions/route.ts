import { getProviderForSession } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;
  try {
    const setup = await provider.getDiscussionSetup({ owner, repo });
    if (!setup) return Response.json({ error: "Site not found." }, { status: 404 });
    return Response.json(setup);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the repository Discussion settings.",
      },
      { status: 502 },
    );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;
  try {
    const setup = await provider.enableDiscussions({ owner, repo });
    return Response.json(setup);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not enable GitHub Discussions for this repository.",
      },
      { status: 502 },
    );
  }
}
