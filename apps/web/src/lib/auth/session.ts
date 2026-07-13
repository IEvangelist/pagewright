import "server-only";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { GitHubUser, ProviderKind } from "@pagewright/github";

/**
 * The encrypted, httpOnly session. Access/refresh tokens live here (sealed by iron-session's AEAD)
 * and never reach the browser — the client only ever learns the public {@link GitHubUser} profile
 * via the /api/auth/session endpoint. All secret use stays server-side.
 */
export interface SessionData {
  user?: GitHubUser;
  providerKind?: ProviderKind;
  /** OAuth/App user access token (sealed at rest). */
  accessToken?: string;
  /** Present only for GitHub-App user-to-server tokens. */
  refreshToken?: string | null;
  /** Epoch ms when the access token expires; undefined = non-expiring. */
  accessTokenExpiresAt?: number;
  /** Transient CSRF value written before redirecting to GitHub, verified in the callback. */
  oauthState?: string;
  /** Where to send the user after a successful sign-in (sanitized, same-site path only). */
  returnTo?: string;
}

const COOKIE_NAME = "pagewright_session";

function resolvePassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters in production.",
    );
  }
  // Dev-only fallback so `pnpm dev` works out of the box (mock mode). Never used in production.
  if (secret) {
    console.warn("[pagewright] SESSION_SECRET is shorter than 32 chars; using a dev fallback.");
  }
  return "pagewright-dev-only-insecure-session-secret-change-me";
}

export function sessionOptions(): SessionOptions {
  return {
    password: resolvePassword(),
    cookieName: COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

/** Read (and, in route handlers, mutate) the current session. */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function getCurrentUser(): Promise<GitHubUser | null> {
  const session = await getSession();
  return session.user ?? null;
}
