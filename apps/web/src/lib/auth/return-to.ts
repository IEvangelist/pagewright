/**
 * Only allow same-site, absolute-path redirects (e.g. "/new?resume=1"). Anything else — external
 * URLs, protocol-relative "//evil.com", backslash tricks, or a missing leading slash — falls back
 * to the dashboard. This keeps the sign-in flow from being abused as an open redirect.
 */
export function sanitizeReturnTo(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
