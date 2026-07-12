/**
 * OAuth-App web flow helpers. Pagewright's default (and fallback for the GitHub App) auth path:
 * redirect the user to GitHub, exchange the returned code for a user access token server-side.
 * Nothing here touches the client secret in the browser — callers run these on the server only.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  /** Opaque CSRF token echoed back to the callback and verified there. */
  state: string;
  scopes?: string[];
  login?: string;
  allowSignup?: boolean;
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  if (params.scopes && params.scopes.length > 0) {
    url.searchParams.set("scope", params.scopes.join(" "));
  }
  if (params.login) url.searchParams.set("login", params.login);
  if (params.allowSignup === false) url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export interface ExchangeCodeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  scope: string;
  /** Present only for GitHub-App user-to-server tokens (which expire). */
  refreshToken: string | null;
  /** Seconds until the access token expires; null for non-expiring OAuth-App tokens. */
  expiresIn: number | null;
  refreshTokenExpiresIn: number | null;
}

export async function exchangeCodeForToken(params: ExchangeCodeParams): Promise<TokenResponse> {
  return postForToken(params.fetchImpl, {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  });
}

export interface RefreshTokenParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

/** Exchange a GitHub-App refresh token for a fresh access token. */
export async function refreshAccessToken(params: RefreshTokenParams): Promise<TokenResponse> {
  return postForToken(params.fetchImpl, {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });
}

async function postForToken(
  fetchImpl: typeof fetch | undefined,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const f = (fetchImpl ?? globalThis.fetch).bind(globalThis);
  const response = await f(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    const message =
      typeof data.error_description === "string"
        ? data.error_description
        : `Token exchange failed (${response.status})`;
    throw new Error(message);
  }
  return {
    accessToken: data.access_token,
    tokenType: typeof data.token_type === "string" ? data.token_type : "bearer",
    scope: typeof data.scope === "string" ? data.scope : "",
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : null,
    refreshTokenExpiresIn:
      typeof data.refresh_token_expires_in === "number" ? data.refresh_token_expires_in : null,
  };
}
