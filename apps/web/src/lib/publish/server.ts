import "server-only";

import type { GitHubProvider, RepoRef } from "@pagewright/github";
import { parsePage } from "@pagewright/blocks";
import {
  HOME_PAGE_PATH,
  derivePageStatus,
  deriveSiteStatus,
  type PagePublishState,
  type PublishState,
} from "./state";

/**
 * Capture a live publishing snapshot for a site: whether GitHub Pages is live/offline and where the
 * managed home page sits in the draft → scheduled → published lifecycle. Used by the manage page for
 * the initial server render and by the publish API route to return fresh state after an action.
 *
 * Each provider call is made resilient — a transient failure degrades to a sensible default rather
 * than blanking the whole panel.
 */
export async function getPublishState(
  provider: GitHubProvider,
  ref: RepoRef,
): Promise<PublishState | null> {
  const repo = await provider.getRepo(ref);
  if (!repo) return null;

  const [pages, file, headSha] = await Promise.all([
    provider.getPages(ref).catch(() => null),
    provider.getFile(ref, HOME_PAGE_PATH).catch(() => null),
    provider.getBranchHead(ref, repo.defaultBranch).catch(() => null),
  ]);

  let page: PagePublishState | null = null;
  if (file) {
    try {
      const parsed = parsePage(JSON.parse(file.content));
      const publishAt = parsed.publishAt ?? null;
      page = {
        path: HOME_PAGE_PATH,
        title: parsed.title,
        draft: parsed.draft,
        publishAt,
        status: derivePageStatus(parsed.draft, publishAt),
        headSha,
      };
    } catch {
      page = null;
    }
  }

  return {
    owner: ref.owner,
    repo: repo.name,
    repoUrl: repo.htmlUrl,
    liveUrl: pages?.url ?? repo.pagesUrl ?? null,
    siteStatus: deriveSiteStatus(pages),
    pagesEnabled: pages?.enabled ?? false,
    page,
    fetchedAt: new Date().toISOString(),
  };
}
