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

## GitHub Discussions comments

Posts can include an ordered `githubDiscussions` component powered by the official
[Giscus](https://giscus.app) client. Readers can read without signing in. Giscus handles GitHub
authentication when someone comments or reacts, so the site does not need or expose a GitHub
secret.

When adding the component in Pagewright:

1. Make the site repository public.
2. Let Pagewright enable GitHub Discussions for the repository if needed.
3. Install the Giscus GitHub App for the repository.
4. Choose a Discussion category in Pagewright. The editor resolves the public GitHub IDs and uses
   the stable `/blog/<slug>/` pathname to find or create one discussion per post.

Advanced settings allow a different public repository or mapping when needed. These values are
public GitHub resource identifiers, not credentials.

Example post component:

```json
{
  "type": "githubDiscussions",
  "id": "comments",
  "props": {
    "repo": "owner/site-repository",
    "repoId": "R_example",
    "category": "Announcements",
    "categoryId": "DIC_example",
    "mapping": "pathname",
    "strict": true,
    "reactionsEnabled": true,
    "inputPosition": "top",
    "theme": "preferred_color_scheme",
    "lang": "en"
  }
}
```

These values identify public GitHub resources. Do not add tokens, app private keys, OAuth secrets,
or other credentials to post JSON.

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
