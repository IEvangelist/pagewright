import * as React from "react";
import {
  PageRenderer,
  PostList,
  PostHeader,
  type Block,
  type PostCard,
} from "@pagewright/blocks";
import { getTemplateMeta } from "@/lib/templates";
import {
  loadBlocksCss,
  loadTemplateHomeBlocks,
  loadTemplatePosts,
  loadTemplatePost,
  loadTemplateSite,
  type DemoPost,
} from "@/lib/provision/template-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Fully isolated, pixel-accurate template preview served as a bare HTML document for the demo page's
 * `<iframe>`. Because it renders the *same* `@pagewright/blocks` components a deployed Astro site
 * uses — with the real `blocks.css` inlined and nothing else — it looks identical to a live site, and
 * because it lives in its own document the template's responsive media queries react to the iframe's
 * width (true form-factor: desktop / tablet / mobile). Theme is set at SSR (no flash) and can be
 * toggled live from the parent via `postMessage` without a reload.
 *
 * Query params: `theme` (light | dark), `view` (home | post), `slug` (post to render when view=post).
 */

/** A post card whose link points back into this frame so navigation stays inside the preview. */
function postToCard(templateId: string, theme: string, post: DemoPost): PostCard {
  return {
    title: post.title,
    href: `/templates/${templateId}/frame?view=post&theme=${theme}&slug=${encodeURIComponent(post.slug)}`,
    date: post.date,
    excerpt: post.excerpt,
    cover: post.cover,
    tags: post.tags,
  };
}

function upcomingToCard(post: DemoPost): PostCard {
  return {
    title: post.title,
    href: "#",
    date: post.publishAt ?? post.date,
    excerpt: post.excerpt,
    tags: post.tags,
  };
}

const THEME_LISTENER = `
(function(){
  function apply(t){
    var dark = t === 'dark';
    var el = document.documentElement;
    el.classList.toggle('dark', dark);
    el.setAttribute('data-theme', dark ? 'dark' : 'light');
    el.style.colorScheme = dark ? 'dark' : 'light';
  }
  window.addEventListener('message', function(e){
    var d = e && e.data || {};
    if (d && d.type === 'pw-theme') apply(d.theme);
  });
})();
`;

const FRAME_RESET = `
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; }
.pw-root { min-height: 100vh; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: hsl(var(--pw-border)); border-radius: 999px; }
.pw-demo-back { display: inline-flex; align-items: center; gap: 8px; color: hsl(var(--pw-primary)); text-decoration: none; font-weight: 600; }
.pw-demo-back:hover { text-decoration: underline; }
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const meta = getTemplateMeta(id as never);
  if (!meta) {
    return new Response("Unknown template", { status: 404 });
  }

  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const view = url.searchParams.get("view") === "post" ? "post" : "home";
  const slug = url.searchParams.get("slug") ?? "";

  const site = loadTemplateSite(id as never) ?? { name: meta.name };
  const css = loadBlocksCss();

  let body: React.ReactNode = null;

  if (id === "blog" && view === "post") {
    const post = loadTemplatePost(id as never, slug);
    if (post) {
      body = (
        <>
          <PostHeader title={post.title} date={post.date} author={post.author} tags={post.tags} />
          <PageRenderer blocks={post.blocks} />
          <div className="pw-section" style={{ paddingBlock: "0 72px" }}>
            <div className="pw-container" style={{ maxWidth: 720 }}>
              <a className="pw-demo-back" href={`/templates/${id}/frame?view=home&theme=${theme}`}>
                ← Back to all posts
              </a>
            </div>
          </div>
        </>
      );
    }
  }

  if (!body) {
    const blocks: Block[] = loadTemplateHomeBlocks(id as never);
    if (id === "blog") {
      // The blog home derives its post list at build time, so inject it between the authored header
      // blocks and the footer — exactly as the generated `index.astro` does.
      const { published, upcoming } = loadTemplatePosts(id as never);
      const footerIndex = blocks.findIndex((b) => b.type === "footer");
      const head = footerIndex >= 0 ? blocks.slice(0, footerIndex) : blocks;
      const footer = footerIndex >= 0 ? blocks.slice(footerIndex) : [];
      body = (
        <>
          <PageRenderer blocks={head} />
          <PostList
            heading="Latest posts"
            posts={published.map((p) => postToCard(id, theme, p))}
            upcoming={upcoming.map(upcomingToCard)}
          />
          <PageRenderer blocks={footer} />
        </>
      );
    } else {
      body = <PageRenderer blocks={blocks} />;
    }
  }

  const bodyHtml = await renderBodyToHtml(<>{body}</>);
  const dark = theme === "dark";
  const htmlAttrs = dark ? ' class="dark" data-theme="dark"' : ' data-theme="light"';

  const doc = `<!doctype html>
<html lang="en"${htmlAttrs} style="color-scheme:${dark ? "dark" : "light"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(site.name)} · Pagewright preview</title>
<style>${css}\n${FRAME_RESET}</style>
</head>
<body class="pw-root">${bodyHtml}<script>${THEME_LISTENER}</script></body>
</html>`;

  return new Response(doc, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Only ever framed by our own app.
      "content-security-policy": "frame-ancestors 'self'",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the block tree to static HTML. `react-dom/server` is imported dynamically so Next's app
 * loader doesn't flag it as a forbidden Server Component import (it's only ever used here, on the
 * Node server, to produce the isolated preview document).
 */
async function renderBodyToHtml(node: React.ReactNode): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(node as React.ReactElement);
}
