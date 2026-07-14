import type { SiteConfig } from "./schema";

export const siteBindingDefinitions = [
  {
    key: "currentYear",
    token: "{{currentYear}}",
    label: "Current year",
    description: "The year when the site is built.",
  },
  {
    key: "site.name",
    token: "{{site.name}}",
    label: "Site name",
    description: "The name from global site settings.",
  },
  {
    key: "site.description",
    token: "{{site.description}}",
    label: "Site description",
    description: "The description from global site settings.",
  },
  {
    key: "site.url",
    token: "{{site.url}}",
    label: "Site URL",
    description: "The canonical URL from global site settings.",
  },
] as const;

export type SiteBindingKey = (typeof siteBindingDefinitions)[number]["key"];
export type BindingValues = Partial<Record<SiteBindingKey, string>> & Record<string, string>;

/** Build the common values available to authored `{{binding}}` tokens. */
export function createSiteBindings(
  site?: SiteConfig | null,
  now: Date = new Date(),
): BindingValues {
  const bindings: BindingValues = {
    currentYear: String(now.getUTCFullYear()),
  };
  if (site) {
    bindings["site.name"] = site.name;
    bindings["site.description"] = site.description ?? "";
    bindings["site.url"] = site.url ?? "";
  }
  return bindings;
}

/** Replace known `{{binding}}` tokens while preserving unknown tokens for forward compatibility. */
export function resolveBindingString(value: string, bindings: BindingValues): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (token, key: string) => {
    const binding = bindings[key];
    return Object.prototype.hasOwnProperty.call(bindings, key) && binding !== undefined
      ? binding
      : token;
  });
}

/** Resolve tokens inside authored HTML without letting plain-text site details inject markup. */
export function resolveHtmlBindingString(value: string, bindings: BindingValues): string {
  const escapedBindings = Object.fromEntries(
    Object.entries(bindings).map(([key, binding]) => [
      key,
      binding
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;"),
    ]),
  ) as BindingValues;
  return resolveBindingString(value, escapedBindings);
}

/**
 * Resolve bindings recursively in JSON-shaped content such as block props, pages, and site links.
 * Non-string primitives are returned unchanged.
 */
export function resolveBindings<T>(value: T, bindings: BindingValues): T {
  if (typeof value === "string") {
    return resolveBindingString(value, bindings) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBindings(item, bindings)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveBindings(item, bindings)]),
    ) as T;
  }
  return value;
}
