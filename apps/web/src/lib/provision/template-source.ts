import "server-only";
import type { CommitFile } from "@pagewright/github";
import type { TemplateId } from "@pagewright/registry";
import bundle from "./provision-bundle.generated.json";

/**
 * Template + vendored-package sources for provisioning, read from a build-time generated bundle
 * (see `scripts/build-provision-bundle.mjs`) rather than the monorepo filesystem.
 *
 * Reading from an imported JSON module — instead of walking `templates/` on disk — is what lets
 * provisioning work in a serverless deployment (Netlify), where the monorepo source tree is not
 * present next to the function. The bundle is regenerated before every `dev`/`build`, so it always
 * reflects the current templates and `@pagewright/*` sources.
 */

interface ProvisionBundle {
  templates: Record<string, CommitFile[]>;
  vendor: CommitFile[];
}

const typedBundle = bundle as unknown as ProvisionBundle;

/** Copy so callers can freely transform files without mutating the shared bundle. */
function clone(files: CommitFile[]): CommitFile[] {
  return files.map((file) => ({ ...file }));
}

/** Load every source file for a template as commit-ready entries (repo-relative paths, utf-8). */
export function loadTemplateFiles(templateId: TemplateId): CommitFile[] {
  const files = typedBundle.templates[templateId];
  if (!files) {
    throw new Error(
      `Template "${templateId}" is not present in the provision bundle. ` +
        `Re-run scripts/build-provision-bundle.mjs.`,
    );
  }
  return clone(files);
}

/**
 * The vendored `@pagewright/*` package sources committed into every generated repo under `vendor/`.
 * Generated repos reference them with `file:` dependencies + `vite.ssr.noExternal`, so a plain
 * `npm install` + `astro build` resolves and transpiles them with no npm publishing required.
 */
export function loadVendorFiles(): CommitFile[] {
  return clone(typedBundle.vendor);
}
