/**
 * A tiny, dependency-free GitHub REST client over `fetch`. We deliberately avoid Octokit here:
 * Pagewright owns its build bits, wants predictable bundle size in Netlify functions, and needs
 * only a narrow slice of the API. This client adds auth headers, JSON handling, typed errors,
 * rate-limit awareness, cursor pagination, and modest retry/backoff for transient failures.
 */

const DEFAULT_BASE_URL = "https://api.github.com";
const DEFAULT_USER_AGENT = "pagewright";
const API_VERSION = "2022-11-28";

export interface RateLimit {
  limit: number;
  remaining: number;
  /** Epoch seconds when the primary rate limit resets. */
  reset: number;
}

export class GitHubRestError extends Error {
  readonly status: number;
  readonly url: string;
  readonly data: unknown;
  readonly rateLimit: RateLimit | null;
  constructor(message: string, status: number, url: string, data: unknown, rateLimit: RateLimit | null) {
    super(message);
    this.name = "GitHubRestError";
    this.status = status;
    this.url = url;
    this.data = data;
    this.rateLimit = rateLimit;
  }
}

export interface RestClientOptions {
  token: string;
  /** "token" for classic OAuth-App user tokens works too, but "Bearer" is accepted for all. */
  scheme?: "Bearer" | "token";
  baseUrl?: string;
  userAgent?: string;
  /** Max automatic retries for 5xx / secondary-rate-limit / network errors. */
  maxRetries?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra query params. */
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Treat these non-2xx statuses as `null` instead of throwing (e.g. 404 for "does it exist?"). */
  allowStatuses?: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateLimit(headers: Headers): RateLimit | null {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (limit === null || remaining === null || reset === null) return null;
  return { limit: Number(limit), remaining: Number(remaining), reset: Number(reset) };
}

export class RestClient {
  private readonly token: string;
  private readonly scheme: "Bearer" | "token";
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  lastRateLimit: RateLimit | null = null;

  constructor(opts: RestClientOptions) {
    this.token = opts.token;
    this.scheme = opts.scheme ?? "Bearer";
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.maxRetries = opts.maxRetries ?? 3;
    const f = opts.fetchImpl ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error("global fetch is not available; provide fetchImpl");
    }
    this.fetchImpl = f.bind(globalThis);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const method = opts.method ?? "GET";
    const allow = new Set(opts.allowStatuses ?? []);

    let attempt = 0;
    // Retry loop for transient conditions; deterministic errors bail immediately.
    for (;;) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            accept: "application/vnd.github+json",
            "x-github-api-version": API_VERSION,
            "user-agent": this.userAgent,
            authorization: `${this.scheme} ${this.token}`,
            ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
            ...opts.headers,
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch (err) {
        // Network-level failure: retry with backoff, then surface.
        if (attempt < this.maxRetries) {
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        throw new GitHubRestError(
          `Network error calling ${method} ${url}: ${(err as Error).message}`,
          0,
          url,
          null,
          null,
        );
      }

      this.lastRateLimit = parseRateLimit(response.headers);

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      if (allow.has(response.status)) {
        return null as T;
      }

      // Retry on secondary rate limits (403/429 with retry-after) and 5xx.
      const retryAfter = response.headers.get("retry-after");
      const isRateLimited =
        (response.status === 403 || response.status === 429) &&
        (retryAfter !== null || this.lastRateLimit?.remaining === 0);
      const isServerError = response.status >= 500;
      if ((isRateLimited || isServerError) && attempt < this.maxRetries) {
        const waitMs = retryAfter !== null ? Number(retryAfter) * 1000 : rateLimitWaitMs(this.lastRateLimit, attempt);
        await sleep(waitMs);
        attempt++;
        continue;
      }

      const data = await safeJson(response);
      const message =
        (isRecord(data) && typeof data.message === "string" ? data.message : response.statusText) ||
        `Request failed with status ${response.status}`;
      throw new GitHubRestError(
        `${method} ${url} -> ${response.status}: ${message}`,
        response.status,
        url,
        data,
        this.lastRateLimit,
      );
    }
  }

  /** Follow `Link: rel="next"` pagination, accumulating array pages up to `maxPages`. */
  async paginate<T>(path: string, opts: RequestOptions & { maxPages?: number } = {}): Promise<T[]> {
    const maxPages = opts.maxPages ?? 10;
    const perPage = 100;
    const out: T[] = [];
    let page = 1;
    for (; page <= maxPages; page++) {
      const items = await this.request<T[]>(path, {
        ...opts,
        query: { per_page: perPage, page, ...opts.query },
      });
      if (!Array.isArray(items) || items.length === 0) break;
      out.push(...items);
      if (items.length < perPage) break;
    }
    return out;
  }
}

function backoffMs(attempt: number): number {
  // Exponential with jitter: ~0.5s, 1s, 2s ...
  const base = 500 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

function rateLimitWaitMs(rateLimit: RateLimit | null, attempt: number): number {
  if (rateLimit && rateLimit.remaining === 0) {
    const untilReset = rateLimit.reset * 1000 - Date.now();
    // Cap the wait so a UI request never hangs indefinitely; fall back to backoff.
    if (untilReset > 0 && untilReset < 60_000) return untilReset + 500;
  }
  return backoffMs(attempt);
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
