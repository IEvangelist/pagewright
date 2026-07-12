import * as React from "react";
import {
  CalendarClock,
  Check,
  Globe,
  Heart,
  Image as ImageIcon,
  LayoutTemplate,
  type LucideIcon,
  Palette,
  PenTool,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

/**
 * Curated, named icon set for content blocks (e.g. feature cards).
 *
 * Content references an icon by *name* (a stable string) rather than embedding an emoji, so the
 * builder and generated Astro sites render the same crisp vector icon from a real icon library.
 * Add to this map to expose more choices in the builder's icon picker.
 */
export const blockIcons = {
  palette: Palette,
  rocket: Rocket,
  calendar: CalendarClock,
  image: ImageIcon,
  shield: ShieldCheck,
  recycle: RefreshCw,
  sparkles: Sparkles,
  zap: Zap,
  globe: Globe,
  layout: LayoutTemplate,
  pen: PenTool,
  check: Check,
  star: Star,
  heart: Heart,
} satisfies Record<string, LucideIcon>;

export type BlockIconName = keyof typeof blockIcons;

export const blockIconNames = Object.keys(blockIcons) as BlockIconName[];

/** Renders a named block icon. Unknown/empty names render nothing (safe fallback). */
export function BlockIcon({
  name,
  size = 24,
  strokeWidth = 1.75,
}: {
  name?: string;
  size?: number;
  strokeWidth?: number;
}) {
  if (!name) return null;
  const Icon = blockIcons[name as BlockIconName];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}
