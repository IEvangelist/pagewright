import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl } from "@pagewright/github";
import { getAppUrl, getOAuthCallbackUrl, resolveAuthConfig } from "@/lib/auth/env";
import { getSession } from "@/lib/auth/session";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const dynamic = "force-dynamic";

/**
 * Begins sign-in. In mock mode we mint a demo session immediately (no GitHub round-trip) so the
 * app is fully explorable offline; otherwise we stash a CSRF `state` and redirect to GitHub. An
 * optional `?returnTo=/path` sends the user back where they started (e.g. mid-way through the
 * new-site wizard) once sign-in completes.
 */
export async function GET(request: NextRequest) {
  const config = resolveAuthConfig();
  const session = await getSession();
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));

  if (config.mode === "mock") {
    const login = process.env.PAGEWRIGHT_MOCK_LOGIN?.trim() || "octocat";
    session.user = {
      id: 424242,
      login,
      name: "Pagewright Demo",
      avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(login)}`,
      htmlUrl: `https://github.com/${login}`,
    };
    session.providerKind = "mock";
    session.returnTo = undefined;
    await session.save();
    return NextResponse.redirect(`${getAppUrl()}${returnTo}`);
  }

  const state = randomBytes(16).toString("hex");
  session.oauthState = state;
  session.returnTo = returnTo;
  await session.save();

  const authorizeUrl = buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: getOAuthCallbackUrl(),
    state,
    scopes: config.scopes,
  });
  return NextResponse.redirect(authorizeUrl);
}
