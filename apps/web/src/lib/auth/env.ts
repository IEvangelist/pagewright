import "server-only";

/**
 * Resolves how Pagewright authenticates, from environment only (never the client). The same web
 * flow powers both strategies:
 *   - "app": a GitHub App user-to-server token (preferred; fine-grained, refreshable, 8h TTL).
 *   - "oauth": a classic OAuth App user token (fallback; broad scopes, non-expiring).
 *   - "mock": no credentials — a demo session so the whole app is usable offline.
 *
 * Precedence: explicit PAGEWRIGHT_AUTH_MODE, else GitHub App creds, else OAuth App creds, else mock.
 */

export type AuthMode = "app" | "oauth" | "mock";

export interface OAuthLikeConfig {
  mode: "app" | "oauth";
  clientId: string;
  clientSecret: string;
  /** OAuth App scopes (ignored by GitHub Apps, which derive permissions from the installation). */
  scopes: string[];
  /** GitHub App user tokens expire and ship refresh tokens; OAuth App tokens do not. */
  issuesRefreshTokens: boolean;
}

export type AuthConfig = { mode: "mock" } | OAuthLikeConfig;

/** Scopes for the OAuth-App fallback (a GitHub App ignores these). */
const OAUTH_SCOPES = ["repo", "workflow", "delete_repo", "read:user"];

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function hasGitHubApp(): boolean {
  return Boolean(env("GITHUB_APP_CLIENT_ID") && env("GITHUB_APP_CLIENT_SECRET"));
}

function hasOAuthApp(): boolean {
  return Boolean(env("GITHUB_OAUTH_CLIENT_ID") && env("GITHUB_OAUTH_CLIENT_SECRET"));
}

export function resolveAuthConfig(): AuthConfig {
  const forced = env("PAGEWRIGHT_AUTH_MODE") as AuthMode | undefined;

  if (forced === "mock") return { mode: "mock" };

  if ((forced === "app" || !forced) && hasGitHubApp()) {
    return {
      mode: "app",
      clientId: env("GITHUB_APP_CLIENT_ID")!,
      clientSecret: env("GITHUB_APP_CLIENT_SECRET")!,
      scopes: [],
      issuesRefreshTokens: true,
    };
  }

  if ((forced === "oauth" || !forced) && hasOAuthApp()) {
    return {
      mode: "oauth",
      clientId: env("GITHUB_OAUTH_CLIENT_ID")!,
      clientSecret: env("GITHUB_OAUTH_CLIENT_SECRET")!,
      scopes: OAUTH_SCOPES,
      issuesRefreshTokens: false,
    };
  }

  // Explicitly requested a real mode but creds are missing → fail loud rather than silently mock.
  if (forced === "app" || forced === "oauth") {
    throw new Error(
      `PAGEWRIGHT_AUTH_MODE=${forced} but the matching GitHub credentials are not set. ` +
        `Set the client id/secret, or unset PAGEWRIGHT_AUTH_MODE to use demo (mock) mode.`,
    );
  }

  return { mode: "mock" };
}

export function getAuthMode(): AuthMode {
  return resolveAuthConfig().mode;
}

/** Base URL of the deployed app, used to build the OAuth redirect URI. */
export function getAppUrl(): string {
  return (
    env("PAGEWRIGHT_APP_URL") ??
    env("NEXT_PUBLIC_APP_URL") ??
    // Netlify provides this at build/runtime; fall back to localhost for dev.
    env("URL") ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function getOAuthCallbackUrl(): string {
  return `${getAppUrl()}/api/auth/callback`;
}
