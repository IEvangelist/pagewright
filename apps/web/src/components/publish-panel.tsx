"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileEdit,
  Globe,
  Loader2,
  Power,
  PowerOff,
  Rocket,
  Send,
  X,
} from "lucide-react";
import type { PublishState } from "@/lib/publish/state";

type Busy =
  | null
  | "publish-site"
  | "unpublish-site"
  | "publish-page"
  | "unpublish-page"
  | "schedule-page";

/** A local `datetime-local` value (`YYYY-MM-DDTHH:mm`) one hour from now, as a sensible default. */
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Publishing controls for a site. Two concerns, cleanly separated:
 *  - the whole **site** going live/offline on GitHub Pages, and
 *  - the home **page** moving through draft → scheduled → published.
 *
 * Every action posts to `/api/sites/{owner}/{repo}/publish` and swaps in the fresh state the server
 * returns, then refreshes the route so the deploy-progress view above reflects any triggered build.
 */
export function PublishPanel({ initial }: { initial: PublishState }) {
  const router = useRouter();
  const [state, setState] = useState<PublishState>(initial);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>(defaultScheduleValue);

  const run = useCallback(
    async (action: NonNullable<Busy>, extra?: { publishAt?: string }) => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${state.owner}/${state.repo}/publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const body = (await res.json().catch(() => null)) as
          | { state?: PublishState; error?: string }
          | null;
        if (!res.ok || !body?.state) {
          setError(body?.error ?? "Something went wrong. Please try again.");
          return false;
        }
        setState(body.state);
        setScheduling(false);
        router.refresh();
        return true;
      } catch {
        setError("Network error. Please try again.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [state.owner, state.repo, router],
  );

  const page = state.page;
  const siteBadge = SITE_BADGES[state.siteStatus];

  return (
    <section className="pw-publish" aria-label="Publishing">
      <h2 className="pw-publish__heading">Publishing</h2>

      {error ? (
        <div className="pw-publish__error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="pw-publish__grid">
        {/* Site online/offline */}
        <div className="pw-publish__card">
          <div className="pw-publish__cardhead">
            <span className="pw-publish__cardtitle">
              <Globe size={16} aria-hidden="true" /> Site
            </span>
            <span className={`pw-pill pw-pill--${siteBadge.tone}`}>
              {siteBadge.icon}
              {siteBadge.label}
            </span>
          </div>

          <p className="pw-publish__desc">
            {state.siteStatus === "offline"
              ? "Your site is offline. Publish it to build and serve it on GitHub Pages."
              : state.siteStatus === "building"
                ? "GitHub Pages is building your site. It’ll be live shortly."
                : "Your site is live on GitHub Pages."}
          </p>

          {state.liveUrl && state.siteStatus !== "offline" ? (
            <a className="pw-linkpill" href={state.liveUrl} target="_blank" rel="noreferrer">
              <Globe size={14} aria-hidden="true" />
              <span>{state.liveUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}

          <div className="pw-publish__actions">
            {state.siteStatus === "offline" ? (
              <button
                type="button"
                className="pw-btn pw-btn--primary"
                disabled={busy !== null}
                onClick={() => void run("publish-site")}
              >
                {busy === "publish-site" ? (
                  <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                ) : (
                  <Power size={15} aria-hidden="true" />
                )}
                Publish site
              </button>
            ) : (
              <button
                type="button"
                className="pw-btn pw-btn--danger"
                disabled={busy !== null}
                onClick={() => {
                  if (
                    window.confirm(
                      "Take this site offline? Visitors will get a 404 until you publish it again. Your content and repo are kept.",
                    )
                  ) {
                    void run("unpublish-site");
                  }
                }}
              >
                {busy === "unpublish-site" ? (
                  <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                ) : (
                  <PowerOff size={15} aria-hidden="true" />
                )}
                Take offline
              </button>
            )}
          </div>
        </div>

        {/* Home page draft / schedule / publish */}
        <div className="pw-publish__card">
          <div className="pw-publish__cardhead">
            <span className="pw-publish__cardtitle">
              <FileEdit size={16} aria-hidden="true" /> Home page
            </span>
            {page ? (
              <span className={`pw-pill pw-pill--${PAGE_BADGES[page.status].tone}`}>
                {PAGE_BADGES[page.status].icon}
                {PAGE_BADGES[page.status].label}
              </span>
            ) : null}
          </div>

          {!page ? (
            <p className="pw-publish__desc">
              No home page document found yet. Open the editor to create one.
            </p>
          ) : (
            <>
              <p className="pw-publish__desc">
                {page.status === "published"
                  ? "This page is live and served to visitors."
                  : page.status === "scheduled"
                    ? `Scheduled to publish on ${formatWhen(page.publishAt)}.`
                    : "This page is a draft and isn’t served on the live site."}
              </p>

              {scheduling ? (
                <div className="pw-publish__schedule">
                  <label className="pw-publish__schedlabel" htmlFor="pw-schedule-at">
                    Publish at
                  </label>
                  <input
                    id="pw-schedule-at"
                    type="datetime-local"
                    className="pw-publish__schedinput"
                    value={scheduleAt}
                    min={defaultScheduleValue()}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                  <div className="pw-publish__actions">
                    <button
                      type="button"
                      className="pw-btn pw-btn--primary"
                      disabled={busy !== null || !scheduleAt}
                      onClick={() => void run("schedule-page", { publishAt: scheduleAt })}
                    >
                      {busy === "schedule-page" ? (
                        <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                      ) : (
                        <CalendarClock size={15} aria-hidden="true" />
                      )}
                      Schedule
                    </button>
                    <button
                      type="button"
                      className="pw-btn pw-btn--ghost"
                      disabled={busy !== null}
                      onClick={() => setScheduling(false)}
                    >
                      <X size={15} aria-hidden="true" /> Cancel
                    </button>
                  </div>
                  <p className="pw-publish__hint">
                    Scheduled content is promoted automatically by a workflow in your repo — no need
                    to keep this app open.
                  </p>
                </div>
              ) : (
                <div className="pw-publish__actions">
                  {page.status !== "published" ? (
                    <button
                      type="button"
                      className="pw-btn pw-btn--primary"
                      disabled={busy !== null}
                      onClick={() => void run("publish-page")}
                    >
                      {busy === "publish-page" ? (
                        <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                      ) : (
                        <Rocket size={15} aria-hidden="true" />
                      )}
                      Publish now
                    </button>
                  ) : null}

                  {page.status !== "scheduled" ? (
                    <button
                      type="button"
                      className="pw-btn pw-btn--ghost"
                      disabled={busy !== null}
                      onClick={() => {
                        setScheduleAt(defaultScheduleValue());
                        setScheduling(true);
                      }}
                    >
                      <CalendarClock size={15} aria-hidden="true" /> Schedule…
                    </button>
                  ) : null}

                  {page.status !== "draft" ? (
                    <button
                      type="button"
                      className="pw-btn pw-btn--ghost"
                      disabled={busy !== null}
                      onClick={() => void run("unpublish-page")}
                    >
                      {busy === "unpublish-page" ? (
                        <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                      ) : (
                        <FileEdit size={15} aria-hidden="true" />
                      )}
                      {page.status === "scheduled" ? "Cancel schedule" : "Unpublish"}
                    </button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const SITE_BADGES = {
  live: { label: "Live", tone: "success", icon: <CheckCircle2 size={13} aria-hidden="true" /> },
  building: { label: "Building", tone: "info", icon: <Loader2 size={13} className="pw-spin" aria-hidden="true" /> },
  offline: { label: "Offline", tone: "muted", icon: <PowerOff size={13} aria-hidden="true" /> },
} as const;

const PAGE_BADGES = {
  published: { label: "Published", tone: "success", icon: <Send size={13} aria-hidden="true" /> },
  scheduled: { label: "Scheduled", tone: "info", icon: <Clock size={13} aria-hidden="true" /> },
  draft: { label: "Draft", tone: "muted", icon: <FileEdit size={13} aria-hidden="true" /> },
} as const;
