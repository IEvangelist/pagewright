import "server-only";
import TurndownService from "turndown";

/**
 * HTML → Markdown, used when opening an existing post whose body was stored as HTML (older posts, or
 * content authored before the markdown composer). Converting on load lets every post open in the
 * markdown editor with its real content instead of raw tags. Runs server-side only (Turndown ships
 * its own lightweight DOM), in the edit route.
 */
let service: TurndownService | null = null;

function getService(): TurndownService {
  if (!service) {
    service = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });
  }
  return service;
}

export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  try {
    return getService().turndown(html).trim();
  } catch {
    // Fall back to a crude tag strip so the author still sees their words.
    return html
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
