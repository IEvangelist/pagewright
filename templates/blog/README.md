# @pagewright/template-blog

A blog starter for [Pagewright](../../README.md). Built with **Astro**, rendered from the shared
**`@pagewright/blocks`** component library, and wired to deploy to **GitHub Pages**.

## How content works

- The home page (`src/data/pages/home.json`) is authored blocks (navbar, hero, footer). The list of
  posts is rendered automatically below the hero.
- Each post is a JSON document in `src/data/posts/*.json` validated against the shared `postSchema`
  (title, `date`, `excerpt`, `cover`, `tags`, `author`, `draft`, `publishAt`, and a body of blocks).
- Individual post pages are generated at `/blog/<slug>/` from `src/pages/blog/[slug].astro`.
- **Drafts** (`draft: true`) and posts with a future `publishAt` are excluded from the build.
- Site-wide settings live in `src/data/site.json`. Uploaded images go to `public/media/`.
- A sitemap is generated via `@astrojs/sitemap`.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in ./dist
```

## Workflows

- `deploy.yml` — builds and publishes to GitHub Pages on every push to `main`.
- `scheduled-publish.yml` — runs on a cron (~every 30 min) and on demand; promotes any post/page
  whose `publishAt` has passed from draft to published, commits the change, and triggers a deploy.
  > GitHub Actions cron is best-effort and can be delayed on free plans, so also expose a manual
  > "Publish now" (this workflow's `workflow_dispatch`).
- `update-kit.yml` — applies a Pagewright-managed dependency/workflow update as a pull request,
  preserving your content. Pagewright triggers it via `repository_dispatch` with the new manifest.

> **Note (monorepo vs. generated repo):** inside this monorepo the template uses `workspace:*`
> dependencies for local development. When Pagewright generates a user's repo it rewrites those to
> pinned `@pagewright/*` versions from the managed registry so the repo is fully self-contained.
