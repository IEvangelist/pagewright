# Pagewright

**Build and publish beautiful GitHub Pages sites — no code required.**

Pagewright lets any GitHub user pick from a suite of **Astro** templates, customize them in a
visual drag-and-drop builder, and — with one click — provision a new repository wired with all the
GitHub Actions needed to **self-deploy to GitHub Pages** and safely self-update. Draft pages,
schedule publishing, drag-and-drop images, and publish/unpublish, all from one app, all acting on
your behalf through GitHub auth.

> Status: **early foundation.** This repo currently contains the monorepo scaffold, the shared
> block library, one Astro template that deploys to Pages, and the Next.js builder app shell. See
> the roadmap below.

## Why it's built this way

The core idea is **one block library, two consumers**:

- Block/section UI is a set of **React components + Zod schema** in `@pagewright/blocks`.
- The **builder** (Next.js) edits a block tree and renders it live.
- The **generated Astro sites** render the *exact same* React components at build time via
  `@astrojs/react` — static HTML, islands only where needed.

Result: **zero preview drift** — what you design is byte-for-byte what deploys — and content is a
portable, versioned JSON model that lives in the user's own repo (the source of truth).

## Monorepo layout

```
apps/
  web/                 # Next.js (App Router) builder app — deploys on Netlify
packages/
  blocks/              # Shared React blocks + Zod schema + CSS (the linchpin)
  site-kit/            # Versioned Astro rendering kit (theme script, schema, migrations)
  registry/            # Managed dependency registry — versioned build bits per template
  github/              # GitHub provider abstraction (OAuth App + GitHub App + mock)
templates/
  landing/             # Astro landing/marketing starter -> GitHub Pages
  blog/                # Astro blog starter (posts, drafts, scheduling, sitemap)
  portfolio/           # Astro portfolio starter (project gallery)
brand/                 # Brand kit (colors, logo, tokens)
```

## Getting started

```bash
pnpm install
pnpm dev        # runs the builder app + template dev servers via Turborepo
pnpm build      # builds every workspace
pnpm typecheck
```

- Builder app: <http://localhost:3000>
- Landing template: <http://localhost:4321>

### Authentication & demo mode

The builder authenticates solely through GitHub, behind a swappable provider interface
(`@pagewright/github`) with three strategies:

- **GitHub App** (preferred) — fine-grained, refreshable user-to-server tokens.
- **OAuth App** (fallback) — classic user token with `repo`/`workflow` scopes.
- **Mock** (default with no credentials) — an in-memory provider so the entire app (sign-in,
  dashboard, provisioning, publishing, deploy progress) is fully explorable offline.

With nothing configured, `pnpm dev` runs in **demo mode**: click **Sign in with GitHub** to mint a
demo session and land on the dashboard with seeded sites. To use real GitHub, copy `.env.example`
to `apps/web/.env.local` and set the App or OAuth client id/secret plus a 32+ char `SESSION_SECRET`.
Tokens are sealed in an httpOnly, encrypted session cookie and only ever used server-side.

### Creating a site

From the dashboard, **New site** opens a guided wizard: search the template gallery (blog,
portfolio, landing) by type, name the site, pick an accent + default theme, and choose visibility.
On submit, `POST /api/sites/provision` streams progress as newline-delimited JSON while the server:

1. **creates the repository** (auto-init, tagged with the `pagewright` topic),
2. **commits the rendered template + workflows** in one atomic Git Data API commit — the
   `package.json`, pinned workflow action versions, and `pagewright.json` stamp all come from the
   **dependency registry** (not the template's own copies), so every site deploys on the exact
   build bits Pagewright maintains,
3. **enables GitHub Pages** (Actions build), and
4. **surfaces the first deploy run** so the wizard can deep-link it.

Progress renders live per-step with a congratulatory completion (live URL, repo, and deploy links).
Work-in-progress selections autosave to `localStorage`; a failed commit rolls the empty repo back so
retries stay clean. In demo mode the whole flow runs against the in-memory provider.

### Editing a site

Each site's page opens the **visual editor** (`/sites/{owner}/{repo}/edit`) — a Puck drag-and-drop
canvas wired to the *same* React block components the generated Astro site renders, so the preview is
pixel-identical to production. Add, reorder, and configure blocks (navbar, hero, features, gallery,
call-to-action, prose, footer) with shadcn-styled panels. Every change autosaves to `localStorage`
(keyed per site + page), so a reload or crash never loses work. Hitting **Publish** converts the
block tree back into the page document, re-validates it with the shared Zod schema, and commits it to
the repo via `POST /api/sites/{owner}/{repo}/pages` — pushing to the default branch and triggering the
deploy workflow. The local draft is cleared only after the commit succeeds.

Saves are guarded against lost updates: the editor captures the branch head SHA when it loads and
sends it with every commit (`expectedHeadSha`). If the repo moved elsewhere in the meantime, the
commit is rejected and the editor shows a conflict banner offering **reload latest** or **overwrite
with my version** — so concurrent edits never silently clobber each other.

### Uploading media

Image props (hero image, navbar logo, gallery items) render a **drag-and-drop upload field** in the
editor: drop a file or click to browse. The image is read in the browser, base64-encoded, and sent to
`POST /api/sites/{owner}/{repo}/media`, which sanitizes the filename, appends a short content hash to
avoid collisions, and commits it to the repo's `public/media/<slug>-<hash>.<ext>` with `base64`
encoding — the same atomic commit path everything else uses. The field stores a **root-relative**
URL (`/media/…`); at build time the blocks prefix it with the site's base path
(`import.meta.env.BASE_URL`), so it resolves correctly whether the site is served from a user/org
root (`/`) or a **project page** subpath (`/<repo>/`), and looks identical in the editor preview.
Uploads are capped at 8 MB and limited to common image types (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO);
pasting an external URL still works as a fallback.

### Publishing

Each site's manage page (`/sites/{owner}/{repo}`) has a **Publishing** panel with two concerns kept
deliberately separate:

- **Site — live / offline.** Publish the site to enable GitHub Pages (and kick a build), or take it
  offline with a confirmation. Offline disables Pages; your content and repo are untouched, so you can
  bring it back anytime.
- **Home page — draft → scheduled → published.** *Publish now* clears the draft flag so the page goes
  live on the next deploy; *Unpublish* turns it back into a draft; *Schedule…* sets a future
  `publishAt`. All three commit the page JSON via `POST /api/sites/{owner}/{repo}/publish`, which
  pushes to the default branch and triggers the deploy workflow.

Scheduling is **delegated to GitHub Actions**, not this app: the generated `scheduled-publish.yml`
runs on a cron in the user's repo and promotes any draft whose `publishAt` has passed — so scheduled
content goes live even if the app is never opened again.

## Tech decisions

| Area            | Choice                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Builder app     | Next.js (App Router) + shadcn/ui + next-themes, hosted on **Netlify**  |
| Auth            | **GitHub App** (primary) + OAuth App (fallback), behind a provider API |
| Generated sites | **Astro** → static → **GitHub Pages** with generated Actions           |
| Editing         | Full visual drag-and-drop (**Puck**) over a shared block model         |
| Blocks styling  | Self-contained CSS + tokens (no Tailwind coupling) for perfect parity  |

## Roadmap

- [x] Monorepo + brand tokens
- [x] Shared block library + schema
- [x] Landing template + Pages deploy workflow
- [x] Builder app shell (light/dark, live block rendering)
- [x] Managed dependency registry (versioned build bits + update detection)
- [x] Blog + portfolio templates + scheduled-publish / update-kit workflows
- [x] GitHub auth (App + OAuth + mock) behind a provider abstraction, encrypted sessions, dashboard
- [x] One-click site provisioning (create repo, push template, enable Pages) with live progress
- [x] Live deployment progress (ordered steps, expandable detail, deep links, redeploy, congrats)
- [x] Visual drag-and-drop editor (Puck) + localStorage autosave + commit-to-repo
- [x] Explicit Save with SHA-based conflict detection (reload / overwrite)
- [x] Drag-and-drop media uploads (committed to repo `public/media/`, content-hashed)
- [x] Draft / schedule / publish / unpublish lifecycle (site online/offline + page scheduling)
- [x] Dashboard with live block-preview thumbnails per site
- [x] Base-path–aware asset & link resolution (works on GitHub Pages project subpaths)

## Production prerequisites

Pagewright runs fully in **demo mode** out of the box (`PAGEWRIGHT_AUTH_MODE=mock`) — the entire
create → edit → publish flow works against an in-memory GitHub. Two things must be in place before
generated sites build in *real* GitHub Actions:

1. **GitHub credentials.** Provide the GitHub App (or OAuth App fallback) env vars so the provider
   can act on a user's behalf — see `.env.example`.
2. **Resolvable build bits.** A generated repo's `package.json` pins `@pagewright/blocks` and
   `@pagewright/site-kit` at the registry-managed versions from
   `packages/registry/src/manifests.ts`. Those are currently private workspace packages, so a
   generated repo's CI `npm install` can only resolve them once they are **published** to a registry
   the workflow can reach (npm or GitHub Packages) at those versions, **or** provisioning is extended
   to **vendor** their built output into the repo. Until one of those is done, the deploy workflow's
   install step fails on the `@pagewright/*` dependencies. Everything else the generated site needs —
   base path, pinned action versions, Node version, and content schema — is already rendered per repo,
   so once those two packages resolve, `npm run build` produces a correct GitHub Pages bundle.

## License

TBD.
