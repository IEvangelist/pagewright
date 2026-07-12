import type { SiteManifest, ActionPin, DependencySet } from "./schema";

/**
 * The registry data. THIS is the single source of truth for the versioned build bits of every
 * generated site. Bumping a manifest here (a new `manifestVersion`) is how Pagewright rolls all
 * existing sites forward — provisioning uses the latest manifest, and returning users are offered a
 * managed update to it (dependency bumps + refreshed workflows + content migrations).
 */

/** The current registry release. Bump this (and add a manifest row) to ship a managed update. */
export const CURRENT_MANIFEST_VERSION = "2026.7.0";

/** Pinned GitHub Actions shared by the generated Pages workflows. */
const CORE_ACTIONS: ActionPin[] = [
  { uses: "actions/checkout", version: "v4" },
  { uses: "actions/configure-pages", version: "v5" },
  { uses: "actions/setup-node", version: "v4" },
  { uses: "actions/upload-pages-artifact", version: "v3" },
  { uses: "actions/deploy-pages", version: "v4" },
];

/** Build bits every template shares. Individual templates extend this. */
const CORE_DEPENDENCIES: DependencySet = {
  astro: "5.2.0",
  "@astrojs/react": "4.2.0",
  "@pagewright/blocks": "0.1.0",
  "@pagewright/site-kit": "0.1.0",
  "lucide-react": "0.469.0",
  react: "19.0.0",
  "react-dom": "19.0.0",
};

const CORE_DEV_DEPENDENCIES: DependencySet = {
  "@types/react": "19.0.2",
  "@types/react-dom": "19.0.2",
};

const RELEASED_AT = "2026-07-12";

export const MANIFESTS: SiteManifest[] = [
  {
    manifestVersion: CURRENT_MANIFEST_VERSION,
    templateId: "landing",
    channel: "stable",
    schemaVersion: "1",
    kitVersion: "0.1.0",
    node: "20",
    packageManager: "npm",
    dependencies: { ...CORE_DEPENDENCIES },
    devDependencies: { ...CORE_DEV_DEPENDENCIES },
    actions: CORE_ACTIONS,
    notes: "Initial stable manifest for the landing template.",
    releasedAt: RELEASED_AT,
  },
  {
    manifestVersion: CURRENT_MANIFEST_VERSION,
    templateId: "blog",
    channel: "stable",
    schemaVersion: "1",
    kitVersion: "0.1.0",
    node: "20",
    packageManager: "npm",
    dependencies: {
      ...CORE_DEPENDENCIES,
      "@astrojs/sitemap": "3.2.1",
    },
    devDependencies: { ...CORE_DEV_DEPENDENCIES },
    actions: CORE_ACTIONS,
    notes: "Initial stable manifest for the blog template (adds sitemap).",
    releasedAt: RELEASED_AT,
  },
  {
    manifestVersion: CURRENT_MANIFEST_VERSION,
    templateId: "portfolio",
    channel: "stable",
    schemaVersion: "1",
    kitVersion: "0.1.0",
    node: "20",
    packageManager: "npm",
    dependencies: { ...CORE_DEPENDENCIES },
    devDependencies: { ...CORE_DEV_DEPENDENCIES },
    actions: CORE_ACTIONS,
    notes: "Initial stable manifest for the portfolio template.",
    releasedAt: RELEASED_AT,
  },
];
