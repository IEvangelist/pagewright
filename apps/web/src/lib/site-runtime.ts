import type { BlockIconName } from "@pagewright/blocks";

/** Runtime source introduced with global settings, bindings, and icon-bearing links. */
export const GLOBAL_FEATURES_RUNTIME_PATH = "vendor/pagewright-blocks/src/bindings.ts";

/** Icon names shipped by the 2026.7.0 generated runtime. */
export const LEGACY_BLOCK_ICON_NAMES = [
  "palette",
  "rocket",
  "calendar",
  "image",
  "shield",
  "recycle",
  "sparkles",
  "zap",
  "globe",
  "layout",
  "pen",
  "check",
  "star",
  "heart",
] as const satisfies readonly BlockIconName[];
