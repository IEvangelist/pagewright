import "server-only";
import {
  createAppProvider,
  createMockProvider,
  createOAuthProvider,
  refreshAccessToken,
  type GitHubProvider,
} from "@pagewright/github";
import { resolveAuthConfig } from "./env";
import { getSession } from "./session";
import type { IronSession } from "iron-session";
import type { SessionData } from "./session";

/**
 * Bridges an authenticated session to a concrete {@link GitHubProvider}. Everything downstream
 * (dashboard, provisioning, publishing) takes the provider and stays blissfully unaware of which
 * auth strategy produced it. In mock mode this returns the in-memory provider so the app is fully
 * usable with zero credentials.
 */
export async function getProviderForSession(): Promise<GitHubProvider | null> {
  const config = resolveAuthConfig();
  const session = await getSession();

  if (config.mode === "mock") {
    if (!session.user) return null;
    return createMockProvider(session.user.login);
  }

  if (!session.accessToken || !session.user) return null;

  // Proactively refresh GitHub-App user tokens that are close to expiry.
  if (config.mode === "app" && session.refreshToken && isExpiring(session)) {
    try {
      const refreshed = await refreshAccessToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: session.refreshToken,
      });
      applyTokenToSession(session, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresIn);
      await session.save();
    } catch {
      // Refresh failed (revoked/expired). Force re-auth by clearing the session.
      session.destroy();
      return null;
    }
  }

  return config.mode === "app"
    ? createAppProvider(session.accessToken)
    : createOAuthProvider(session.accessToken);
}

/** True when the access token expires within the next two minutes. */
function isExpiring(session: SessionData): boolean {
  if (!session.accessTokenExpiresAt) return false;
  return session.accessTokenExpiresAt - Date.now() < 2 * 60 * 1000;
}

export function applyTokenToSession(
  session: IronSession<SessionData> | SessionData,
  accessToken: string,
  refreshToken: string | null,
  expiresInSeconds: number | null,
): void {
  session.accessToken = accessToken;
  session.refreshToken = refreshToken;
  session.accessTokenExpiresAt = expiresInSeconds
    ? Date.now() + expiresInSeconds * 1000
    : undefined;
}
