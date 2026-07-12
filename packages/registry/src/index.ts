import {
  siteManifestSchema,
  siteStampSchema,
  type Channel,
  type ManifestDiff,
  type DependencyChange,
  type ActionChange,
  type SiteManifest,
  type SiteStamp,
  type TemplateId,
} from "./schema";
import { MANIFESTS, CURRENT_MANIFEST_VERSION } from "./manifests";

export * from "./schema";
export { CURRENT_MANIFEST_VERSION } from "./manifests";

/** Builder app version stamped into generated repos. */
export const APP_VERSION = "0.1.0";

/**
 * Validated registry. Parsing here means a malformed manifest fails loudly at import time rather
 * than when a user tries to publish — a core "just works" guarantee.
 */
export const manifests: readonly SiteManifest[] = MANIFESTS.map((m) =>
  siteManifestSchema.parse(m),
);

/** Compare dotted numeric versions ("2026.7.0"). Returns -1 | 0 | 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** All manifests for a template (optionally a channel), newest first. */
export function getManifests(
  templateId: TemplateId,
  channel?: Channel,
): SiteManifest[] {
  return manifests
    .filter((m) => m.templateId === templateId && (!channel || m.channel === channel))
    .sort((a, b) => compareVersions(b.manifestVersion, a.manifestVersion));
}

/** The latest manifest Pagewright would provision / update a site to. */
export function getLatestManifest(
  templateId: TemplateId,
  channel: Channel = "stable",
): SiteManifest | undefined {
  return getManifests(templateId, channel)[0];
}

/** A specific historical manifest, e.g. the one a returning site is currently stamped with. */
export function getManifest(
  templateId: TemplateId,
  manifestVersion: string,
  channel: Channel = "stable",
): SiteManifest | undefined {
  return manifests.find(
    (m) =>
      m.templateId === templateId &&
      m.channel === channel &&
      m.manifestVersion === manifestVersion,
  );
}

function diffDeps(
  from: Record<string, string>,
  to: Record<string, string>,
): DependencyChange[] {
  const names = new Set([...Object.keys(from), ...Object.keys(to)]);
  const changes: DependencyChange[] = [];
  for (const name of names) {
    const a = from[name] ?? null;
    const b = to[name] ?? null;
    if (a !== b) changes.push({ name, from: a, to: b });
  }
  return changes.sort((x, y) => x.name.localeCompare(y.name));
}

function diffActions(from: SiteManifest, to: SiteManifest): ActionChange[] {
  const map = (m: SiteManifest) =>
    Object.fromEntries(m.actions.map((a) => [a.uses, a.version]));
  const a = map(from);
  const b = map(to);
  const uses = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: ActionChange[] = [];
  for (const u of uses) {
    const fa = a[u] ?? null;
    const tb = b[u] ?? null;
    if (fa !== tb) changes.push({ uses: u, from: fa, to: tb });
  }
  return changes.sort((x, y) => x.uses.localeCompare(y.uses));
}

/** Describe everything that changes when moving a site from one manifest to another. */
export function diffManifests(from: SiteManifest, to: SiteManifest): ManifestDiff {
  return {
    dependencies: diffDeps(from.dependencies, to.dependencies),
    devDependencies: diffDeps(from.devDependencies, to.devDependencies),
    actions: diffActions(from, to),
    schemaVersionChanged: from.schemaVersion !== to.schemaVersion,
    kitVersionChanged: from.kitVersion !== to.kitVersion,
  };
}

export interface UpdateCheck {
  available: boolean;
  latest?: SiteManifest;
  current?: SiteManifest;
  diff?: ManifestDiff;
}

/**
 * Given a site's recorded stamp, decide whether a managed update should be pushed and what it
 * entails. This is what the app calls when a user returns to (or re-publishes) their site.
 */
export function isUpdateAvailable(stamp: SiteStamp): UpdateCheck {
  const latest = getLatestManifest(stamp.templateId, stamp.channel);
  if (!latest) return { available: false };
  const available = compareVersions(stamp.manifestVersion, latest.manifestVersion) < 0;
  const current = getManifest(stamp.templateId, stamp.manifestVersion, stamp.channel);
  return {
    available,
    latest,
    current,
    diff: available && current ? diffManifests(current, latest) : undefined,
  };
}

export interface RenderPackageJsonOptions {
  name: string;
  description?: string;
}

/** Render the `package.json` for a standalone generated site repo from a manifest. */
export function renderStandalonePackageJson(
  manifest: SiteManifest,
  options: RenderPackageJsonOptions,
): Record<string, unknown> {
  return {
    name: options.name,
    version: "0.1.0",
    private: true,
    type: "module",
    ...(options.description ? { description: options.description } : {}),
    engines: { node: `>=${manifest.node}` },
    scripts: {
      dev: "astro dev",
      build: "astro build",
      preview: "astro preview",
    },
    dependencies: { ...manifest.dependencies },
    devDependencies: { ...manifest.devDependencies },
  };
}

/** Map of `uses` -> fully-qualified `uses@version`, for templating the generated workflows. */
export function renderActionVersions(manifest: SiteManifest): Record<string, string> {
  const map: Record<string, string> = {};
  for (const action of manifest.actions) {
    map[action.uses] = `${action.uses}@${action.version}`;
  }
  return map;
}

/** Build the `pagewright.json` stamp for a freshly rendered (or updated) repo. */
export function createStamp(
  manifest: SiteManifest,
  createdWith: string = APP_VERSION,
): SiteStamp {
  return siteStampSchema.parse({
    templateId: manifest.templateId,
    manifestVersion: manifest.manifestVersion,
    schemaVersion: manifest.schemaVersion,
    channel: manifest.channel,
    createdWith,
    updatedAt: new Date().toISOString(),
  });
}
