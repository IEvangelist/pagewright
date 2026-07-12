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
templates/
  landing/             # Astro landing/marketing starter -> GitHub Pages
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
- [ ] GitHub App + OAuth auth, provider abstraction, sessions
- [ ] One-click site provisioning (create repo, push template, enable Pages)
- [ ] Visual drag-and-drop editor (Puck) + localStorage autosave + commit-to-repo
- [ ] Drag-and-drop media uploads
- [ ] Draft / schedule / publish / unpublish lifecycle
- [ ] Dashboard with deployed-site thumbnails
- [ ] Blog + portfolio templates

## License

TBD.
