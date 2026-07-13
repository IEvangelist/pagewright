// Snapshots the template sources and the vendored @pagewright/* packages into a single JSON module
// that the builder app imports at runtime. This is what makes provisioning work in a serverless
// function (Netlify), where the monorepo filesystem — templates/ and packages/ — is not present.
//
// The vendored packages are shipped as TypeScript SOURCE. Generated repos consume them via `file:`
// dependencies plus `vite.ssr.noExternal` in astro.config, so a plain `npm install` + `astro build`
// resolves and transpiles them with no npm publishing required.
//
// Run via `node scripts/build-provision-bundle.mjs` (wired into the web app's predev/prebuild).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(
  ROOT,
  "apps/web/src/lib/provision/provision-bundle.generated.json",
);

const TEMPLATE_IDS = ["landing", "blog", "portfolio"];
const IGNORED_DIRS = new Set(["node_modules", "dist", ".astro", ".git", ".turbo"]);

function isIgnoredFile(name) {
  return name === ".DS_Store" || name.endsWith(".tsbuildinfo");
}

/** Recursively collect utf-8 files under absDir as { path, content, encoding } with repo-relative paths. */
async function collectFiles(absDir, { pathPrefix = "", include } = {}) {
  const out = [];
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), childRel);
      } else if (entry.isFile()) {
        if (isIgnoredFile(entry.name)) continue;
        if (include && !include(childRel)) continue;
        const content = await fs.readFile(path.join(dir, entry.name), "utf-8");
        out.push({ path: `${pathPrefix}${childRel}`, content, encoding: "utf-8" });
      }
    }
  }
  await walk(absDir, "");
  return out;
}

/** A vendored package ships only its runtime source + package.json (never tsconfig/readme/etc.). */
function vendorInclude(rel) {
  return rel === "package.json" || rel.startsWith("src/");
}

async function buildVendor() {
  const blocks = await collectFiles(path.join(ROOT, "packages/blocks"), {
    pathPrefix: "vendor/pagewright-blocks/",
    include: vendorInclude,
  });

  const siteKit = await collectFiles(path.join(ROOT, "packages/site-kit"), {
    pathPrefix: "vendor/pagewright-site-kit/",
    include: vendorInclude,
  });

  // Rewrite site-kit's workspace dependency on blocks to a sibling file: path so it resolves in the
  // generated repo (where both live under vendor/).
  for (const file of siteKit) {
    if (file.path === "vendor/pagewright-site-kit/package.json") {
      const pkg = JSON.parse(file.content);
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies["@pagewright/blocks"] = "file:../pagewright-blocks";
      file.content = `${JSON.stringify(pkg, null, 2)}\n`;
    }
  }

  return [...blocks, ...siteKit];
}

async function main() {
  const templates = {};
  for (const id of TEMPLATE_IDS) {
    templates[id] = await collectFiles(path.join(ROOT, "templates", id));
  }

  const vendor = await buildVendor();

  const bundle = {
    templates,
    vendor,
  };

  await fs.writeFile(OUT, `${JSON.stringify(bundle)}\n`, "utf-8");

  const templateCounts = TEMPLATE_IDS.map((id) => `${id}=${templates[id].length}`).join(", ");
  console.log(
    `provision bundle written: ${path.relative(ROOT, OUT)} (templates: ${templateCounts}; vendor=${vendor.length} files)`,
  );
}

main().catch((error) => {
  console.error("Failed to build provision bundle:", error);
  process.exit(1);
});
