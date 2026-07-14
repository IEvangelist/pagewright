/**
 * Keep landing CTA decisions outside React so the server page and tests share one source of truth.
 * Sign-in stays in the account control, which prevents duplicate sign-in prompts in marketing copy.
 *
 * @param {boolean} authenticated
 */
export function getLandingCtas(authenticated) {
  return authenticated
    ? {
        heroPrimary: { label: "Create a site", href: "/new" },
        heroSecondary: { label: "Browse templates", href: "/templates" },
        final: { label: "Open dashboard", href: "/dashboard" },
      }
    : {
        heroPrimary: { label: "Browse templates", href: "/templates" },
        heroSecondary: { label: "How it works", href: "#how-it-works" },
        final: { label: "Create a site", href: "/new" },
      };
}

/** @param {string} templateId */
export function templateDemoHref(templateId) {
  return `/templates/${encodeURIComponent(templateId)}`;
}

/** @param {string} templateId */
export function templateUseHref(templateId) {
  return `/new?template=${encodeURIComponent(templateId)}`;
}

/**
 * @param {string | null} candidate
 * @param {readonly string[]} templateIds
 */
export function resolveTemplateId(candidate, templateIds) {
  return candidate && templateIds.includes(candidate) ? candidate : null;
}
