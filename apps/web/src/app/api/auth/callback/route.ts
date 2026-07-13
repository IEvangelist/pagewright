import { NextResponse, type NextRequest } from "next/server";
import {
  createAppProvider,
  createOAuthProvider,
  exchangeCodeForToken,
} from "@pagewright/github";
import { getAppUrl, getOAuthCallbackUrl, resolveAuthConfig } from "@/lib/auth/env";
import { getSession } from "@/lib/auth/session";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { applyTokenToSession } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

/**
 * OAuth callback: validate the CSRF `state`, exchange the code for a user token, load the profile,
 * and seal it all into the session. Token exchange + storage happen strictly server-side.
 */
export async function GET(request: NextRequest) {
  const config = resolveAuthConfig();
  const appUrl = getAppUrl();

  if (config.mode === "mock") {
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const session = await getSession();
  const expectedState = session.oauthState;
  const returnTo = sanitizeReturnTo(session.returnTo);
  // One-time use: clear the stored state + returnTo regardless of outcome.
  session.oauthState = undefined;
  session.returnTo = undefined;

  if (oauthError) {
    await session.save();
    return redirectWithError(appUrl, oauthError);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    await session.save();
    return redirectWithError(appUrl, "invalid_state");
  }

  try {
    const token = await exchangeCodeForToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: getOAuthCallbackUrl(),
    });

    const provider =
      config.mode === "app"
        ? createAppProvider(token.accessToken)
        : createOAuthProvider(token.accessToken);
    const user = await provider.getAuthenticatedUser();

    session.user = user;
    session.providerKind = config.mode;
    applyTokenToSession(session, token.accessToken, token.refreshToken, token.expiresIn);
    await session.save();

    return NextResponse.redirect(`${appUrl}${returnTo}`);
  } catch (err) {
    await session.save();
    return redirectWithError(appUrl, "exchange_failed", (err as Error).message);
  }
}

function redirectWithError(appUrl: string, code: string, detail?: string): NextResponse {
  const target = new URL(`${appUrl}/`);
  target.searchParams.set("auth_error", code);
  if (detail) target.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(target.toString());
}
