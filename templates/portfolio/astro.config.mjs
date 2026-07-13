// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// `site` and `base` are injected per-repo by Pagewright when it provisions a site
// (GitHub Pages project sites are served from /<repo>/). They fall back to sensible
// defaults for local development.
export default defineConfig({
  site: process.env.PAGEWRIGHT_SITE_URL || "http://localhost:4321",
  base: process.env.PAGEWRIGHT_BASE_PATH || "/",
  integrations: [react()],
  // The @pagewright/* packages are vendored as TypeScript source, so Vite must
  // transpile them rather than treat them as pre-built node_modules externals.
  vite: { ssr: { noExternal: ["@pagewright/blocks", "@pagewright/site-kit"] } },
});
