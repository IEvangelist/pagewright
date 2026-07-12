import * as React from "react";
import type { Block } from "./schema";
import { blockRegistry } from "./blocks";

/** Render a single block by looking up its component in the registry. */
export function BlockRenderer({ block }: { block: Block }) {
  const Component = blockRegistry[block.type] as React.FC<Record<string, unknown>>;
  if (!Component) {
    if (typeof console !== "undefined") {
      console.warn(`[pagewright] Unknown block type: ${(block as { type: string }).type}`);
    }
    return null;
  }
  return <Component {...(block.props as Record<string, unknown>)} />;
}

/** Render an ordered list of blocks (a page body). */
export function PageRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </>
  );
}
