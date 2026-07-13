import { marked } from "marked";

/**
 * Markdown → HTML for post bodies. Used both in the composer's live preview (client) and at save
 * time (server) so what the author sees is exactly what gets committed and deployed. GitHub-flavored
 * with soft line breaks, which matches most people's mental model of writing.
 *
 * A light sanitize pass strips the few things that would let authored markdown script the builder
 * app in the preview (script/style tags, inline event handlers, `javascript:` URLs). This is a
 * pragmatic guard, not a full sanitizer — post content is authored by the repo owner themselves.
 */
marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  if (!md || !md.trim()) return "";
  const html = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(html);
}

/** Strip the handful of constructs that could execute script when the HTML is injected. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

/** Rough reading-time + word count for the composer's status line. */
export function readingStats(md: string): { words: number; minutes: number } {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-!\[\]()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 200)) };
}
