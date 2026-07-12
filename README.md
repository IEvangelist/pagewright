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
- [ ] Visual drag-and-drop editor (Puck) + localStorage autosave + commit-to-repo
- [ ] Drag-and-drop media uploads
- [ ] Draft / schedule / publish / unpublish lifecycle
- [ ] Dashboard with deployed-site thumbnails

## License

TBD.
