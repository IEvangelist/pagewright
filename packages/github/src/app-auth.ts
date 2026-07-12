/**
 * GitHub-App authentication. Two token layers:
 *   1. An app JWT (RS256, signed with the app's private key) — proves "I am this app."
 *   2. An installation access token — minted from the JWT, scoped to one installation's repos.
 *
 * We sign the JWT with Node's built-in crypto so this stays dependency-free. These functions are
 * server-only (they touch the private key) and are never bundled to the client.
 */

import { createSign } from "node:crypto";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface AppJwtOptions {
  appId: string | number;
  privateKey: string;
  /** Clock-skew backdating in seconds (GitHub recommends 60). */
  nowSeconds?: number;
}

/** Create a short-lived (10 min) RS256 JWT that authenticates as the GitHub App. */
export function createAppJwt(opts: AppJwtOptions): string {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    // Backdate to tolerate clock drift; GitHub rejects future-dated `iat`.
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(opts.appId),
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(normalizePem(opts.privateKey));
  return `${signingInput}.${base64url(signature)}`;
}

export interface InstallationTokenOptions {
  appId: string | number;
  privateKey: string;
  installationId: string | number;
  /** Optionally scope the token to specific repositories. */
  repositories?: string[];
  fetchImpl?: typeof fetch;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

/** Mint an installation access token; use it to construct a {@link TokenGitHubProvider}. */
export async function createInstallationToken(
  opts: InstallationTokenOptions,
): Promise<InstallationToken> {
  const jwt = createAppJwt({ appId: opts.appId, privateKey: opts.privateKey });
  const f = (opts.fetchImpl ?? globalThis.fetch).bind(globalThis);
  const response = await f(
    `https://api.github.com/app/installations/${opts.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "pagewright",
        ...(opts.repositories ? { "content-type": "application/json" } : {}),
      },
      body: opts.repositories ? JSON.stringify({ repositories: opts.repositories }) : undefined,
    },
  );
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof data.token !== "string") {
    const message =
      typeof data.message === "string" ? data.message : `Installation token failed (${response.status})`;
    throw new Error(message);
  }
  return {
    token: data.token,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : "",
  };
}

/** Support PEM keys pasted with escaped newlines (common in env vars/CI secrets). */
function normalizePem(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}
