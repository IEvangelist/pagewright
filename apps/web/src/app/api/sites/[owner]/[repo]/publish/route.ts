import { getProviderForSession } from "@/lib/auth/provider";
import { parsePage, type Page } from "@pagewright/blocks";
import type { GitHubProvider, RepoRef } from "@pagewright/github";
import { getPublishState } from "@/lib/publish/server";
import { HOME_PAGE_PATH } from "@/lib/publish/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEPLOY_WORKFLOW_FILE = "deploy.yml";

type PublishAction =
  | "publish-site"
  | "unpublish-site"
  | "publish-page"
  | "unpublish-page"
  | "schedule-page";

const PAGE_ACTIONS: ReadonlySet<string> = new Set<PublishAction>([
  "publish-page",
  "unpublish-page",
  "schedule-page",
]);

const ALL_ACTIONS: ReadonlySet<string> = new Set<PublishAction>([
  "publish-site",
  "unpublish-site",
  "publish-page",
  "unpublish-page",
  "schedule-page",
]);

function isPublishAction(value: unknown): value is PublishAction {
  return typeof value === "string" && ALL_ACTIONS.has(value);
}

function isPageAction(action: PublishAction): boolean {
  return PAGE_ACTIONS.has(action);
}

/**
 * Drive a site's publishing lifecycle. One endpoint, several deliberate actions:
 *
 * - `publish-site` / `unpublish-site` — enable or disable GitHub Pages, taking the whole site
 *   online or offline. Publishing also kicks a deploy so the latest content builds.
 * - `publish-page` — clear draft + any schedule so the page goes live on the next deploy.
 * - `unpublish-page` — mark the page a draft (and drop any schedule) so it stops being served.
 * - `schedule-page` — mark the page a draft with a future `publishAt`; the repo's scheduled-publish
 *   workflow promotes it automatically when the time passes.
 *
 * Page actions commit the mutated JSON, which pushes to the default branch and triggers the deploy
 * workflow. Every response returns a fresh {@link getPublishState} snapshot so the client stays in
 * sync without a full reload.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const provider = await getProviderForSession();
  if (!provider) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { owner, repo } = await params;
  const ref: RepoRef = { owner, repo };

  let body: { action?: unknown; publishAt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  if (!isPublishAction(action)) {
    return Response.json({ error: "Unknown publish action." }, { status: 400 });
  }

  const repoData = await provider.getRepo(ref).catch(() => null);
  if (!repoData) {
    return Response.json({ error: "Site not found." }, { status: 404 });
  }

  try {
    if (action === "publish-site") {
      await provider.enablePages(ref, { buildType: "workflow" });
      // Kick a build so the freshly-published site reflects current content. Best-effort: a failure
      // to dispatch shouldn't undo the (successful) enable.
      await provider
        .dispatchWorkflow(ref, DEPLOY_WORKFLOW_FILE, repoData.defaultBranch)
        .catch(() => undefined);
    } else if (action === "unpublish-site") {
      await provider.disablePages(ref);
    } else if (isPageAction(action)) {
      // Page-level lifecycle change.
      let publishAt: string | undefined;
      if (action === "schedule-page") {
        const raw = typeof body.publishAt === "string" ? body.publishAt : "";
        const when = new Date(raw);
        if (!raw || Number.isNaN(when.getTime())) {
          return Response.json({ error: "A valid publish date is required." }, { status: 400 });
        }
        if (when.getTime() <= Date.now()) {
          return Response.json(
            { error: "Pick a time in the future to schedule publishing." },
            { status: 400 },
          );
        }
        publishAt = when.toISOString();
      }
      await mutatePage(provider, ref, repoData.defaultBranch, action, publishAt);
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Publishing action failed." },
      { status: 502 },
    );
  }

  const state = await getPublishState(provider, ref);
  return Response.json({ ok: true, state });
}

/** Load the home page, apply the draft/schedule change, and commit it (which triggers a deploy). */
async function mutatePage(
  provider: GitHubProvider,
  ref: RepoRef,
  branch: string,
  action: PublishAction,
  publishAt: string | undefined,
): Promise<void> {
  const existing = await provider.getFile(ref, HOME_PAGE_PATH).catch(() => null);
  let page: Page;
  try {
    page = existing
      ? parsePage(JSON.parse(existing.content))
      : parsePage({ title: ref.repo, blocks: [] });
  } catch {
    page = parsePage({ title: ref.repo, blocks: [] });
  }

  if (action === "publish-page") {
    page.draft = false;
    delete page.publishAt;
  } else if (action === "unpublish-page") {
    page.draft = true;
    delete page.publishAt;
  } else if (action === "schedule-page") {
    page.draft = true;
    page.publishAt = publishAt;
  }

  const content = `${JSON.stringify(page, null, 2)}\n`;
  const verb =
    action === "publish-page" ? "Publish" : action === "schedule-page" ? "Schedule" : "Unpublish";
  await provider.commitFiles(ref, {
    message: `${verb} home page via Pagewright`,
    files: [{ path: HOME_PAGE_PATH, content }],
    branch,
  });
}
