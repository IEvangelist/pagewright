import { z } from "zod";

/**
 * The managed dependency registry.
 *
 * Pagewright owns a canonical, versioned set of *manifests* — one per template + release channel.
 * A manifest pins the EXACT build bits a generated site needs so that every deploy is reproducible
 * and every returning user can be rolled forward onto versions Pagewright maintains (fixing drift,
 * breakage, and security issues centrally). Generated repos carry a small `pagewright.json` *stamp*
 * recording which manifest they were built from.
 */

export const templateIdSchema = z.enum(["landing", "blog", "portfolio"]);
export type TemplateId = z.infer<typeof templateIdSchema>;

export const channelSchema = z.enum(["stable", "beta"]);
export type Channel = z.infer<typeof channelSchema>;

/** name -> version (exact or range) map, as it appears in a package.json deps block. */
export const dependencySetSchema = z.record(z.string(), z.string());
export type DependencySet = z.infer<typeof dependencySetSchema>;

/** A pinned GitHub Action used by the generated workflows. `version` may be a tag or a commit SHA. */
export const actionPinSchema = z.object({
  uses: z.string(), // e.g. "actions/checkout"
  version: z.string(), // e.g. "v4" or a 40-char SHA
});
export type ActionPin = z.infer<typeof actionPinSchema>;

export const siteManifestSchema = z.object({
  /** Registry release this manifest belongs to (calendar-ish semver, e.g. "2026.7.0"). */
  manifestVersion: z.string(),
  templateId: templateIdSchema,
  channel: channelSchema.default("stable"),
  /** Content-model schema version the site's data conforms to (drives migrations). */
  schemaVersion: z.string(),
  /** Pinned `@pagewright/site-kit` version the generated repo depends on. */
  kitVersion: z.string(),
  /** Node major used by the deploy workflow. */
  node: z.string(),
  packageManager: z.enum(["npm", "pnpm"]).default("npm"),
  dependencies: dependencySetSchema,
  devDependencies: dependencySetSchema.default({}),
  /** GitHub Actions the generated workflows pin to. */
  actions: z.array(actionPinSchema).default([]),
  /** Human-readable changelog note for this manifest (shown in update PRs). */
  notes: z.string().optional(),
  releasedAt: z.string(), // ISO date
});
export type SiteManifest = z.infer<typeof siteManifestSchema>;

/** Written to `pagewright.json` at the root of each generated repo. */
export const siteStampSchema = z.object({
  templateId: templateIdSchema,
  manifestVersion: z.string(),
  schemaVersion: z.string(),
  channel: channelSchema.default("stable"),
  /** Version of the builder app that created/last-updated the repo. */
  createdWith: z.string(),
  updatedAt: z.string().optional(),
});
export type SiteStamp = z.infer<typeof siteStampSchema>;

/** Result of comparing two manifests — used to describe a managed update PR. */
export interface ManifestDiff {
  dependencies: DependencyChange[];
  devDependencies: DependencyChange[];
  actions: ActionChange[];
  schemaVersionChanged: boolean;
  kitVersionChanged: boolean;
}

export interface DependencyChange {
  name: string;
  from: string | null;
  to: string | null;
}

export interface ActionChange {
  uses: string;
  from: string | null;
  to: string | null;
}
