import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommitFile } from "@pagewright/github";
import type { TemplateId } from "@pagewright/registry";

/**
 * Reads a template's source files off disk so they can be committed into a freshly provisioned repo.
 * Build artifacts (`node_modules`, `dist`, `.astro`) are excluded — only the authored source that
 * belongs in a generated site is returned.
 *
 * NOTE: this resolves the monorepo `templates/` directory from the filesystem, which works in local
 * dev and `next start`. A serverless deployment (Netlify) must bundle the templates with the
 * function (e.g. via `includeFiles`) or swap this loader for a build-time generated bundle.
 */

const IGNORED_DIRS = new Set(["node_modules", "dist", ".astro", ".git", ".turbo"]);
const IGNORED_FILES = new Set([".DS_Store", "*.tsbuildinfo"]);

let cachedRoot: string | null = null;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Walk up from the current working directory to the workspace root (has `pnpm-workspace.yaml`). */
async function findWorkspaceRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (await pathExists(path.join(dir, "pnpm-workspace.yaml"))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate the Pagewright workspace root (pnpm-workspace.yaml). Templates are unavailable in this environment.",
  );
}

function isIgnoredFile(name: string): boolean {
  if (IGNORED_FILES.has(name)) return true;
  if (name.endsWith(".tsbuildinfo")) return true;
  return false;
}

/** Load every source file for a template as commit-ready entries (repo-relative paths, utf-8). */
export async function loadTemplateFiles(
  templateId: TemplateId,
): Promise<CommitFile[]> {
  const root = await findWorkspaceRoot();
  const templateDir = path.join(root, "templates", templateId);
  if (!(await pathExists(templateDir))) {
    throw new Error(`Template "${templateId}" was not found at ${templateDir}.`);
  }

  const files: CommitFile[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(absDir, entry.name), rel);
      } else if (entry.isFile()) {
        if (isIgnoredFile(entry.name)) continue;
        const content = await fs.readFile(path.join(absDir, entry.name), "utf-8");
        files.push({ path: rel, content, encoding: "utf-8" });
      }
    }
  }

  await walk(templateDir, "");
  return files;
}
