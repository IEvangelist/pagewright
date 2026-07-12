"use client";

import "@measured/puck/puck.css";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Puck, type Data } from "@measured/puck";
import { AlertCircle, ArrowLeft, Check, ExternalLink, Globe, Loader2 } from "lucide-react";
import { puckConfig } from "@/lib/builder/puck-config";

const DRAFT_PREFIX = "pagewright:page-draft:";
const DRAFT_DEBOUNCE_MS = 600;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Visual page editor. Wraps Puck with the Pagewright block config so editing is fully WYSIWYG
 * against the real block components. Every change is autosaved to localStorage (so a reload or crash
 * never loses work); the explicit "Publish" action commits the page back to the repo — which pushes
 * to `main` and triggers the deploy workflow — and clears the local draft.
 */
export function SiteEditor({
  owner,
  repo,
  path,
  siteName,
  liveUrl,
  initialData,
}: {
  owner: string;
  repo: string;
  path: string;
  siteName: string;
  liveUrl: string | null;
  initialData: Data;
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

  const onChange = useCallback(
    (next: Data) => {
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

  const onPublish = useCallback(
    async (next: Data) => {
      setSaveState("saving");
      setMessage(null);
      try {
        const res = await fetch(`/api/sites/${owner}/${repo}/pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, data: next }),
        });
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!res.ok) {
          setSaveState("error");
          setMessage(body?.error ?? "Couldn’t save your changes.");
          return;
        }
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
  if (state === "idle") return null;
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
