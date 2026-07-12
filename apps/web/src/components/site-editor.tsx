"use client";

import "@measured/puck/puck.css";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Puck, type Data } from "@measured/puck";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  RotateCw,
} from "lucide-react";
import { puckConfig } from "@/lib/builder/puck-config";

const DRAFT_PREFIX = "pagewright:page-draft:";
const DRAFT_DEBOUNCE_MS = 600;

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

/**
 * Visual page editor. Wraps Puck with the Pagewright block config so editing is fully WYSIWYG
 * against the real block components. Every change is autosaved to localStorage (so a reload or crash
 * never loses work); the explicit "Publish" action commits the page back to the repo — which pushes
 * to `main` and triggers the deploy workflow — and clears the local draft.
 *
 * Saves are guarded against lost updates: the editor remembers the branch head SHA it loaded and
 * sends it with every commit. If the repo moved elsewhere in the meantime the server responds 409 and
 * the editor surfaces a conflict banner offering "reload latest" or "overwrite".
 */
export function SiteEditor({
  owner,
  repo,
  path,
  siteName,
  liveUrl,
  initialData,
  initialHeadSha,
}: {
  owner: string;
  repo: string;
  path: string;
  siteName: string;
  liveUrl: string | null;
  initialData: Data;
  initialHeadSha: string | null;
}) {
  const draftKey = `${DRAFT_PREFIX}${owner}/${repo}:${path}`;
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [data] = useState<Data>(() => {
    if (typeof window === "undefined") return initialData;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Data;
        // Defer the "restored" flag out of render.
        queueMicrotask(() => setRestoredDraft(true));
        return parsed;
      }
    } catch {
      // ignore corrupt drafts
    }
    return initialData;
  });

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The branch head the editor is working against. Sent with every save for conflict detection and
  // advanced to the new commit after each successful save so consecutive saves don't false-conflict.
  const headShaRef = useRef<string | null>(initialHeadSha);
  // The most recent editor data, kept so a conflict "overwrite" can re-submit what the user has.
  const lastDataRef = useRef<Data>(data);

  const onChange = useCallback(
    (next: Data) => {
      lastDataRef.current = next;
      setSaveState((s) => (s === "saved" ? "idle" : s));
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(draftKey, JSON.stringify(next));
        } catch {
          // storage full / unavailable — non-fatal
        }
      }, DRAFT_DEBOUNCE_MS);
    },
    [draftKey],
  );

  const save = useCallback(
    async (next: Data, { force = false }: { force?: boolean } = {}) => {
      lastDataRef.current = next;
      setSaveState("saving");
      setMessage(null);
      try {
        const res = await fetch(`/api/sites/${owner}/${repo}/pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path,
            data: next,
            // Omit the guard on an explicit overwrite so the commit lands regardless.
            expectedHeadSha: force ? undefined : headShaRef.current ?? undefined,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | { error?: string; code?: string; headSha?: string }
          | null;
        if (res.status === 409 || body?.code === "conflict") {
          setSaveState("conflict");
          setMessage(body?.error ?? "This site changed somewhere else since you started editing.");
          return;
        }
        if (!res.ok) {
          setSaveState("error");
          setMessage(body?.error ?? "Couldn’t save your changes.");
          return;
        }
        if (body?.headSha) headShaRef.current = body.headSha;
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        setRestoredDraft(false);
        setSaveState("saved");
        setMessage("Saved — deploying your changes");
      } catch {
        setSaveState("error");
        setMessage("Network error while saving. Your work is kept locally.");
      }
    },
    [owner, repo, path, draftKey],
  );

  const onPublish = useCallback((next: Data) => save(next), [save]);
  const onOverwrite = useCallback(
    () => save(lastDataRef.current, { force: true }),
    [save],
  );
  const onReload = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    window.location.reload();
  }, [draftKey]);

  return (
    <div className="pw-editor">
      <div className="pw-editor__bar">
        <Link href={`/sites/${owner}/${repo}`} className="pw-editor__back">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to site</span>
        </Link>
        <div className="pw-editor__titlewrap">
          <span className="pw-editor__title">{siteName}</span>
          {restoredDraft ? (
            <span className="pw-editor__draftflag">Restored unsaved draft</span>
          ) : null}
        </div>
        <div className="pw-editor__baractions">
          {liveUrl ? (
            <a className="pw-linkpill" href={liveUrl} target="_blank" rel="noreferrer">
              <Globe size={14} aria-hidden="true" />
              <span>View live</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}
          <SaveBadge state={saveState} message={message} />
        </div>
      </div>
      {saveState === "conflict" ? (
        <div className="pw-editor__conflict" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="pw-editor__conflicttext">
            {message ?? "This site changed somewhere else since you started editing."}
          </span>
          <button type="button" className="pw-btn pw-btn--ghost" onClick={onReload}>
            <RotateCw size={14} aria-hidden="true" /> Reload latest
          </button>
          <button type="button" className="pw-btn pw-btn--primary" onClick={onOverwrite}>
            Overwrite with my version
          </button>
        </div>
      ) : null}
      <div className="pw-editor__canvas">
        <Puck
          config={puckConfig}
          data={data}
          onChange={onChange}
          onPublish={onPublish}
          iframe={{ enabled: false }}
        />
      </div>
    </div>
  );
}

function SaveBadge({ state, message }: { state: SaveState; message: string | null }) {
  // The conflict case is surfaced by a dedicated banner with actions, not the compact badge.
  if (state === "idle" || state === "conflict") return null;
  const icon =
    state === "saving" ? (
      <Loader2 size={14} className="pw-spin" aria-hidden="true" />
    ) : state === "saved" ? (
      <Check size={14} aria-hidden="true" />
    ) : (
      <AlertCircle size={14} aria-hidden="true" />
    );
  const label =
    state === "saving" ? "Saving…" : state === "saved" ? message ?? "Saved" : message ?? "Error";
  return (
    <span className={`pw-editor__savebadge pw-editor__savebadge--${state}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
}
