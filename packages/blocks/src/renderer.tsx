import * as React from "react";
import type { Block } from "./schema";
import { blockRegistry } from "./blocks";

/** Render a single block by looking up its component in the registry. */
export function BlockRenderer({ block, base }: { block: Block; base?: string }) {
  const Component = blockRegistry[block.type] as React.FC<Record<string, unknown>>;
  if (!Component) {
    if (typeof console !== "undefined") {
      console.warn(`[pagewright] Unknown block type: ${(block as { type: string }).type}`);
    }
    return null;
  }
  return <Component {...(block.props as Record<string, unknown>)} base={base} />;
}

/**
 * Render an ordered list of blocks (a page body). `base` is the site's base path
 * (`import.meta.env.BASE_URL` in Astro); it is threaded to every block as a prop so root-relative
 * image and link URLs resolve correctly on GitHub Pages project sites. Defaults to `/`. Kept
 * context-free so blocks remain renderable as React Server Components.
 */
export function PageRenderer({ blocks, base }: { blocks: Block[]; base?: string }) {
  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} base={base} />
      ))}
    </>
  );
}
