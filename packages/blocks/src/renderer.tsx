import * as React from "react";
import type { Block, SiteConfig } from "./schema";
import { blockRegistry } from "./blocks";
import {
  createSiteBindings,
  resolveBindings,
  resolveHtmlBindingString,
  type BindingValues,
} from "./bindings";

/** Render a single block by looking up its component in the registry. */
export function BlockRenderer({
  block,
  base,
  site,
  bindings = createSiteBindings(site),
}: {
  block: Block;
  base?: string;
  site?: SiteConfig;
  bindings?: BindingValues;
}) {
  const Component = blockRegistry[block.type] as React.FC<Record<string, unknown>>;
  if (!Component) {
    if (typeof console !== "undefined") {
      console.warn(`[pagewright] Unknown block type: ${(block as { type: string }).type}`);
    }
    return null;
  }
  const props = resolveBindings(block.props, bindings) as Record<string, unknown>;
  if (block.type === "prose") {
    props.html = resolveHtmlBindingString(block.props.html, bindings);
  }
  const resolvedSite = site ? resolveBindings(site, bindings) : undefined;
  return <Component {...props} base={base} site={resolvedSite} />;
}

/**
 * Render an ordered list of blocks (a page body). `base` is the site's base path
 * (`import.meta.env.BASE_URL` in Astro); it is threaded to every block as a prop so root-relative
 * image and link URLs resolve correctly on GitHub Pages project sites. Defaults to `/`. Kept
 * context-free so blocks remain renderable as React Server Components.
 */
export function PageRenderer({
  blocks,
  base,
  site,
}: {
  blocks: Block[];
  base?: string;
  site?: SiteConfig;
}) {
  const bindings = createSiteBindings(site);
  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          base={base}
          site={site}
          bindings={bindings}
        />
      ))}
    </>
  );
}
