import "server-only";
import type { CommitFile } from "@pagewright/github";
import {
  createStamp,
  renderStandalonePackageJson,
  type SiteManifest,
} from "@pagewright/registry";
import type { ProvisionRequest } from "./shared";

/**
 * Transforms a template's raw source files into the exact files committed to a user's new repo:
 * - `package.json` and the workflow action pins come from the dependency registry manifest (the
 *   single source of truth for build bits), never from whatever the template happened to contain.
 * - `pagewright.json` is stamped so returning visits know what version the site is running.
 * - `src/data/site.json` is personalized with the user's site name, description, and theme choice.
 * - a `.gitignore` is added if the template lacks one.
 */

const GITIGNORE = [
  "# Pagewright-managed",
  "node_modules/",
  "dist/",
  ".astro/",
  ".env",
  ".env.*",
  "!.env.example",
  "*.log",
  ".DS_Store",
  "",
].join("\n");

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Rewrite `uses: owner/action@<anything>` refs to the versions pinned in the manifest. */
function pinActionVersions(
  yaml: string,
  versions: Map<string, string>,
): string {
  return yaml.replace(
    /uses:\s*([\w.-]+\/[\w.-]+)@\S+/g,
    (match, uses: string) => {
      const version = versions.get(uses);
      return version ? `uses: ${uses}@${version}` : match;
    },
  );
}

function renderSiteJson(content: string, req: ProvisionRequest): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(content);
    if (value && typeof value === "object") parsed = value as Record<string, unknown>;
  } catch {
    // Fall back to a minimal config if the template's site.json is unreadable.
  }

  parsed.name = req.siteName;
  parsed.description = req.description;
  if (req.defaultTheme) parsed.defaultTheme = req.defaultTheme;
  if (req.accent) {
    const existingTheme =
      parsed.theme && typeof parsed.theme === "object"
        ? (parsed.theme as Record<string, unknown>)
        : {};
    parsed.theme = { ...existingTheme, accent: req.accent };
  }

  return json(parsed);
}

/**
 * The `@pagewright/*` packages are not published to npm. Instead their source is vendored into each
 * generated repo under `vendor/`, and the standalone `package.json` references them with `file:`
 * specifiers so a plain `npm install` resolves them locally (no registry, no auth, no publish step).
 */
const VENDOR_FILE_DEPS: Record<string, string> = {
  "@pagewright/blocks": "file:./vendor/pagewright-blocks",
  "@pagewright/site-kit": "file:./vendor/pagewright-site-kit",
};

/** Point the `@pagewright/*` dependencies at the vendored source committed alongside the site. */
function withVendoredDeps(pkg: Record<string, unknown>): Record<string, unknown> {
  const deps = { ...((pkg.dependencies as Record<string, string>) ?? {}) };
  for (const [name, spec] of Object.entries(VENDOR_FILE_DEPS)) {
    if (name in deps) deps[name] = spec;
  }
  return { ...pkg, dependencies: deps };
}

export interface RenderInput {
  request: ProvisionRequest;
  manifest: SiteManifest;
  templateFiles: CommitFile[];
  /** Vendored `@pagewright/*` package sources committed under `vendor/` (see `loadVendorFiles`). */
  vendorFiles: CommitFile[];
}

/** Produce the final set of files to commit for a new site. */
export function renderProvisionFiles(input: RenderInput): CommitFile[] {
  const { request, manifest, templateFiles, vendorFiles } = input;
  const actionVersions = new Map(
    manifest.actions.map((action) => [action.uses, action.version]),
  );

  const output: CommitFile[] = [];
  let sawGitignore = false;

  for (const file of templateFiles) {
    if (file.path === "package.json") {
      output.push({
        path: file.path,
        content: json(
          withVendoredDeps(
            renderStandalonePackageJson(manifest, {
              name: request.repoName,
              description: request.description || undefined,
            }),
          ),
        ),
        encoding: "utf-8",
      });
      continue;
    }

    if (file.path === "pagewright.json") {
      output.push({
        path: file.path,
        content: json(createStamp(manifest)),
        encoding: "utf-8",
      });
      continue;
    }

    if (file.path === "src/data/site.json") {
      output.push({
        path: file.path,
        content: renderSiteJson(file.content, request),
        encoding: "utf-8",
      });
      continue;
    }

    if (
      file.path.startsWith(".github/workflows/") &&
      (file.path.endsWith(".yml") || file.path.endsWith(".yaml"))
    ) {
      output.push({
        path: file.path,
        content: pinActionVersions(file.content, actionVersions),
        encoding: "utf-8",
      });
      continue;
    }

    if (file.path === ".gitignore") sawGitignore = true;
    output.push(file);
  }

  if (!sawGitignore) {
    output.push({ path: ".gitignore", content: GITIGNORE, encoding: "utf-8" });
  }

  // Commit the vendored @pagewright/* sources so the generated repo's CI can build with no npm
  // publishing. Their paths (vendor/**) never collide with template files.
  for (const file of vendorFiles) {
    output.push({ ...file, encoding: file.encoding ?? "utf-8" });
  }

  return output;
}
