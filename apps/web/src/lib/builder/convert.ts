import type { Block, BlockType, Page } from "@pagewright/blocks";
import type { Data } from "@measured/puck";

/**
 * Conversion between the Pagewright content model (`Page` = ordered `Block[]`) and Puck's editor
 * `Data` shape. Pure and dependency-light so it is shared by the editor (client) and the save route
 * (server). Puck component keys are the human-readable names below; the page's block `type` is the
 * canonical id stored in the repo.
 */

export const PUCK_NAME_BY_TYPE = {
  navbar: "Navbar",
  hero: "Hero",
  features: "Features",
  gallery: "Gallery",
  cta: "Call to action",
  prose: "Prose",
  githubDiscussions: "GitHub Discussions",
  footer: "Footer",
} satisfies Record<BlockType, string>;

export const TYPE_BY_PUCK_NAME: Record<string, BlockType> = Object.fromEntries(
  Object.entries(PUCK_NAME_BY_TYPE).map(([type, name]) => [name, type as BlockType]),
);

export interface EditorRootProps {
  title: string;
  description: string;
}

/** Build the Puck `Data` an editor is seeded with from a repo page document. */
export function blocksToPuckData(page: Page): Data {
  const data = {
    root: { props: { title: page.title, description: page.description ?? "" } },
    content: page.blocks.map((b) => ({
      type: PUCK_NAME_BY_TYPE[b.type],
      props: { id: b.id, ...b.props },
    })),
    zones: {},
  };
  return data as unknown as Data;
}

let idCounter = 0;
function genId(type: string): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Fold editor `Data` back into a `Page`, preserving fields the editor doesn't touch (slug, draft,
 * publishAt, and any post front-matter) by merging onto the previously-loaded `base` document.
 */
export function puckDataToPage(data: Data, base: Page): Page {
  const rootProps = ((data.root?.props ?? {}) as Partial<EditorRootProps>) ?? {};
  const content = Array.isArray(data.content) ? data.content : [];

  const blocks = content.map((item) => {
    const rawProps = (item.props ?? {}) as Record<string, unknown> & { id?: string };
    const { id, ...props } = rawProps;
    const type = TYPE_BY_PUCK_NAME[item.type] ?? (item.type as BlockType);
    return { type, id: id ?? genId(type), props } as unknown as Block;
  });

  const title =
    typeof rootProps.title === "string" && rootProps.title.trim()
      ? rootProps.title
      : base.title;
  const description =
    typeof rootProps.description === "string" ? rootProps.description : base.description;

  return { ...base, title, description, blocks };
}
