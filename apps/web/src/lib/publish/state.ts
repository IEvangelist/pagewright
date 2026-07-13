/**
 * Publishing-lifecycle model shared by the server helper, the API route, and the client
 * `PublishPanel`. Only *types* are imported from `@pagewright/github`, so this module stays safe to
 * include in a client bundle. All shapes are plain, serializable data.
 */

import type { PagesInfo } from "@pagewright/github";

/** The home page document Pagewright manages for a site. */
export const HOME_PAGE_PATH = "src/data/pages/home.json";

/** Whether the site itself is reachable on GitHub Pages. */
export type SiteStatus = "live" | "building" | "offline";

/** Where a page sits in the draft → scheduled → published lifecycle. */
export type PageStatus = "published" | "scheduled" | "draft";

export interface PagePublishState {
  path: string;
  title: string;
  status: PageStatus;
  draft: boolean;
  /** ISO timestamp the page is scheduled to go live, when scheduled; otherwise null. */
  publishAt: string | null;
  /** Branch head SHA captured when the state was read, for optimistic concurrency on toggles. */
  headSha: string | null;
}

export interface PublishState {
  owner: string;
  repo: string;
  repoUrl: string;
  liveUrl: string | null;
  siteStatus: SiteStatus;
  pagesEnabled: boolean;
  page: PagePublishState | null;
  /** Server clock at capture time. */
  fetchedAt: string;
}

/** Map GitHub Pages info into the coarse {@link SiteStatus} the UI toggles on. */
export function deriveSiteStatus(pages: PagesInfo | null): SiteStatus {
  if (!pages || !pages.enabled) return "offline";
  if (pages.status === "building") return "building";
  return "live";
}

/**
 * Derive a page's lifecycle status. A non-draft page is published. A draft with a future
 * `publishAt` is scheduled; anything else draft (no timestamp, or one already past but not yet
 * promoted by the cron) is a plain draft.
 */
export function derivePageStatus(
  draft: boolean,
  publishAt: string | null,
  now: Date = new Date(),
): PageStatus {
  if (!draft) return "published";
  if (publishAt) {
    const at = new Date(publishAt);
    if (!Number.isNaN(at.getTime()) && at.getTime() > now.getTime()) return "scheduled";
  }
  return "draft";
}
