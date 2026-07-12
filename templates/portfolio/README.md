# @pagewright/template-portfolio

A portfolio starter for [Pagewright](../../README.md). Built with **Astro**, rendered from the
shared **`@pagewright/blocks`** component library, and wired to deploy to **GitHub Pages**.

## How content works

- Page content lives as JSON in `src/data/pages/*.json` — an ordered list of typed **blocks**
  (navbar, hero, **gallery**, cta, prose, footer). This is the source of truth the Pagewright
  visual builder reads and writes.
- The **gallery** block renders your projects as a responsive grid of cards (title, description,
  optional image + link, tags).
- Site-wide settings live in `src/data/site.json`.
- Uploaded images are committed to `public/media/`.
- Blocks are rendered by `PageRenderer` (React) at build time via `@astrojs/react`, producing
  **static HTML with zero client JS** unless a block opts into hydration.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in ./dist
```

## Workflows

- `deploy.yml` — builds and publishes to GitHub Pages on every push to `main`.
- `scheduled-publish.yml` — cron workflow that promotes scheduled drafts (`publishAt`) and rebuilds.
- `update-kit.yml` — applies a Pagewright-managed dependency/workflow update as a pull request,
  preserving your content.

> **Note (monorepo vs. generated repo):** inside this monorepo the template uses `workspace:*`
> dependencies for local development. When Pagewright generates a user's repo it rewrites those to
> pinned `@pagewright/*` versions from the managed registry so the repo is fully self-contained.
