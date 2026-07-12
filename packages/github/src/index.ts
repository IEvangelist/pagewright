/**
 * `@pagewright/github` — the one seam through which Pagewright touches GitHub.
 *
 * Call sites depend only on the {@link GitHubProvider} interface; the concrete strategy (OAuth-App
 * user token, GitHub-App installation token, or the in-memory mock) is chosen at the edge via these
 * factories. This keeps provisioning, publishing, and deploy-progress code auth-agnostic.
 */

export * from "./types";
export {
  RestClient,
  GitHubRestError,
  type RateLimit,
  type RestClientOptions,
  type RequestOptions,
} from "./rest";
export { TokenGitHubProvider, PAGEWRIGHT_TOPIC } from "./provider-token";
export { MockGitHubProvider } from "./mock";
export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  type AuthorizeUrlParams,
  type ExchangeCodeParams,
  type RefreshTokenParams,
  type TokenResponse,
} from "./oauth";
export {
  createAppJwt,
  createInstallationToken,
  type AppJwtOptions,
  type InstallationTokenOptions,
  type InstallationToken,
} from "./app-auth";

import { TokenGitHubProvider } from "./provider-token";
import { MockGitHubProvider } from "./mock";
import type { GitHubProvider } from "./types";

/** Build a provider from an OAuth-App user access token. */
export function createOAuthProvider(token: string): GitHubProvider {
  return new TokenGitHubProvider("oauth", { token });
}

/** Build a provider from a GitHub-App installation access token. */
export function createAppProvider(token: string): GitHubProvider {
  return new TokenGitHubProvider("app", { token });
}

/** Build the demo provider (no credentials required). */
export function createMockProvider(login?: string): GitHubProvider {
  return new MockGitHubProvider(login);
}
