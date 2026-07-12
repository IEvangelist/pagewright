# @pagewright/template-landing

A single-page marketing/landing starter for [Pagewright](../../README.md). Built with **Astro**,
rendered from the shared **`@pagewright/blocks`** component library, and wired to deploy to
**GitHub Pages**.

## How content works

- Page content lives as JSON in `src/data/pages/*.json` — an ordered list of typed **blocks**
  (navbar, hero, features, cta, prose, footer). This is the source of truth the Pagewright visual
  builder reads and writes.
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

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to
`main`. Pagewright enables Pages and injects `PAGEWRIGHT_SITE_URL` / `PAGEWRIGHT_BASE_PATH`
automatically when it provisions the repo.

> **Note (monorepo vs. generated repo):** inside this monorepo the template uses `workspace:*`
> dependencies for local development. When Pagewright generates a user's repo it rewrites those to
> pinned published `@pagewright/*` versions (or vendors them) so the repo is fully self-contained —
> which is what makes the `deploy.yml` above work standalone.

## Roadmap for this template

- `scheduled-publish.yml` — cron workflow that promotes scheduled drafts (`publishAt`) and rebuilds.
- `update-kit.yml` — opens a PR when a newer `@pagewright/site-kit` is available, running content
  migrations so metadata is preserved.
