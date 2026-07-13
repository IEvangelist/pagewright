"use client";

import "@measured/puck/puck.css";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Puck, type Data } from "@measured/puck";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  RotateCw,
  Settings2,
  X,
} from "lucide-react";
import { puckConfig } from "@/lib/builder/puck-config";
import { MediaUploadProvider, type MediaUploader } from "@/lib/builder/media-context";
import type { PostMeta } from "@/lib/content/posts";

const DRAFT_PREFIX = "pagewright:page-draft:";
const DRAFT_DEBOUNCE_MS = 600;

/** Read a File as a bare base64 string (no data-URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/** ISO datetime → the `value` a <input type="datetime-local"> expects (local time, no seconds). */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** A datetime-local input value → a normalized ISO string (or "" when empty/invalid). */
function fromLocalInput(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

/**
 * Visual page/post editor. Wraps Puck with the Pagewright block config so editing is fully WYSIWYG
 * against the real block components. Every change is autosaved to localStorage (so a reload or crash
 * never loses work); the explicit "Publish" action commits the document back to the repo — which
 * pushes to `main` and triggers the deploy workflow — and clears the local draft.
 *
 * When `postMeta` is supplied the editor is in post mode: a "Post details" panel edits the blog
 * front-matter (draft/date/schedule/excerpt/tags/author/cover) and that metadata is sent alongside
 * the body on every save.
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
  editingLabel,
  backHref,
  backLabel = "Back to site",
  liveUrl,
  initialData,
  initialHeadSha,
  postMeta,
}: {
  owner: string;
  repo: string;
  path: string;
  siteName: string;
  editingLabel?: string;
  backHref?: string;
  backLabel?: string;
  liveUrl: string | null;
  initialData: Data;
  initialHeadSha: string | null;
  postMeta?: PostMeta;
}) {
  const isPost = postMeta !== undefined;
  const resolvedBackHref = backHref ?? `/sites/${owner}/${repo}`;
  const draftKey = `${DRAFT_PREFIX}${owner}/${repo}:${path}`;
  const metaDraftKey = `${draftKey}:meta`;

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

  const [meta, setMeta] = useState<PostMeta | undefined>(() => {
    if (!postMeta) return undefined;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(metaDraftKey);
        if (raw) return { ...postMeta, ...(JSON.parse(raw) as Partial<PostMeta>) };
      } catch {
        // ignore corrupt drafts
      }
    }
    return postMeta;
  });
  const metaRef = useRef<PostMeta | undefined>(meta);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const updateMeta = useCallback(
    (patch: Partial<PostMeta>) => {
      setMeta((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        metaRef.current = next;
        try {
          window.localStorage.setItem(metaDraftKey, JSON.stringify(next));
        } catch {
          // non-fatal
        }
        return next;
      });
      setSaveState((s) => (s === "saved" ? "idle" : s));
    },
    [metaDraftKey],
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
            meta: isPost ? metaRef.current : undefined,
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
          window.localStorage.removeItem(metaDraftKey);
        } catch {
          // ignore
        }
        setRestoredDraft(false);
        setSaveState("saved");
        setMessage(
          isPost && metaRef.current?.draft
            ? "Saved as draft — deploying (hidden until published)"
            : "Saved — deploying your changes",
        );
      } catch {
        setSaveState("error");
        setMessage("Network error while saving. Your work is kept locally.");
      }
    },
    [owner, repo, path, draftKey, metaDraftKey, isPost],
  );

  const onPublish = useCallback((next: Data) => save(next), [save]);
  const onOverwrite = useCallback(() => save(lastDataRef.current, { force: true }), [save]);
  const onReload = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(metaDraftKey);
    } catch {
      // ignore
    }
    window.location.reload();
  }, [draftKey, metaDraftKey]);

  // Uploads a dropped/selected image to the repo's media folder and hands back the site-relative URL
  // the block should reference. Memoized so the provider value is stable across renders.
  const uploader = useMemo<MediaUploader>(
    () => ({
      async upload(file) {
        const contentBase64 = await fileToBase64(file);
        const res = await fetch(`/api/sites/${owner}/${repo}/media`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            contentBase64,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | { url?: string; path?: string; error?: string }
          | null;
        if (!res.ok || !body?.url) {
          throw new Error(body?.error ?? "Upload failed.");
        }
        return { url: body.url, path: body.path ?? "" };
      },
    }),
    [owner, repo],
  );

  return (
    <div className="pw-editor">
      <div className="pw-editor__bar">
        <Link href={resolvedBackHref} className="pw-editor__back">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>
        <div className="pw-editor__titlewrap">
          <span className="pw-editor__title">{editingLabel ?? siteName}</span>
          {isPost ? <span className="pw-editor__kind">post</span> : null}
          {restoredDraft ? (
            <span className="pw-editor__draftflag">Restored unsaved draft</span>
          ) : null}
        </div>
        <div className="pw-editor__baractions">
          {isPost ? (
            <button
              type="button"
              className={`pw-btn pw-btn--ghost pw-btn--sm${detailsOpen ? " pw-btn--active" : ""}`}
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
            >
              <Settings2 size={15} aria-hidden="true" />
              <span>Post details</span>
            </button>
          ) : null}
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

      {isPost && detailsOpen && meta ? (
        <PostDetailsPanel
          meta={meta}
          onChange={updateMeta}
          onClose={() => setDetailsOpen(false)}
          uploader={uploader}
        />
      ) : null}

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
        <MediaUploadProvider uploader={uploader}>
          <Puck
            config={puckConfig}
            data={data}
            onChange={onChange}
            onPublish={onPublish}
            iframe={{ enabled: false }}
          />
        </MediaUploadProvider>
      </div>
    </div>
  );
}

/** The blog front-matter editor shown in post mode. */
function PostDetailsPanel({
  meta,
  onChange,
  onClose,
  uploader,
}: {
  meta: PostMeta;
  onChange: (patch: Partial<PostMeta>) => void;
  onClose: () => void;
  uploader: MediaUploader;
}) {
  const [tagsInput, setTagsInput] = useState(meta.tags.join(", "));
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const commitTags = useCallback(
    (raw: string) => {
      const tags = raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      onChange({ tags });
    },
    [onChange],
  );

  const onCoverFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setCoverBusy(true);
      setCoverError(null);
      try {
        const { url } = await uploader.upload(file);
        onChange({ cover: url });
      } catch (err) {
        setCoverError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setCoverBusy(false);
      }
    },
    [onChange, uploader],
  );

  return (
    <div className="pw-postmeta" role="group" aria-label="Post details">
      <div className="pw-postmeta__head">
        <h2 className="pw-postmeta__title">Post details</h2>
        <button
          type="button"
          className="pw-postmeta__close"
          onClick={onClose}
          aria-label="Close post details"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="pw-postmeta__grid">
        <label className="pw-field pw-field--check">
          <input
            type="checkbox"
            checked={meta.draft}
            onChange={(e) => onChange({ draft: e.target.checked })}
          />
          <span>
            <strong>Draft</strong> — keep hidden from the published site
          </span>
        </label>

        <label className="pw-field">
          <span className="pw-field__label">Publish date</span>
          <input
            type="datetime-local"
            className="pw-input"
            value={toLocalInput(meta.date)}
            onChange={(e) => onChange({ date: fromLocalInput(e.target.value) })}
          />
        </label>

        <label className="pw-field">
          <span className="pw-field__label">Schedule for (optional)</span>
          <input
            type="datetime-local"
            className="pw-input"
            value={toLocalInput(meta.publishAt)}
            onChange={(e) => onChange({ publishAt: fromLocalInput(e.target.value) })}
          />
          <span className="pw-field__hint">
            If set to the future, the post stays hidden until this time.
          </span>
        </label>

        <label className="pw-field">
          <span className="pw-field__label">Author</span>
          <input
            type="text"
            className="pw-input"
            value={meta.author}
            placeholder="Your name"
            onChange={(e) => onChange({ author: e.target.value })}
          />
        </label>

        <label className="pw-field pw-field--wide">
          <span className="pw-field__label">Excerpt</span>
          <textarea
            className="pw-input pw-textarea"
            value={meta.excerpt}
            rows={2}
            placeholder="A short summary shown in post lists and social previews."
            onChange={(e) => onChange({ excerpt: e.target.value })}
          />
        </label>

        <label className="pw-field pw-field--wide">
          <span className="pw-field__label">Tags</span>
          <input
            type="text"
            className="pw-input"
            value={tagsInput}
            placeholder="comma, separated, tags"
            onChange={(e) => {
              setTagsInput(e.target.value);
              commitTags(e.target.value);
            }}
          />
        </label>

        <div className="pw-field pw-field--wide">
          <span className="pw-field__label">Cover image</span>
          <div className="pw-postmeta__cover">
            {meta.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="pw-postmeta__coverimg" src={meta.cover} alt="" />
            ) : (
              <div className="pw-postmeta__coverempty" aria-hidden="true">
                <ImagePlus size={18} />
              </div>
            )}
            <div className="pw-postmeta__coveractions">
              <label className="pw-btn pw-btn--ghost pw-btn--sm">
                {coverBusy ? (
                  <Loader2 size={14} className="pw-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus size={14} aria-hidden="true" />
                )}
                <span>{meta.cover ? "Replace" : "Upload"}</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onCoverFile(e.target.files?.[0])}
                />
              </label>
              {meta.cover ? (
                <button
                  type="button"
                  className="pw-btn pw-btn--ghost pw-btn--sm"
                  onClick={() => onChange({ cover: "" })}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          {coverError ? <span className="pw-field__error">{coverError}</span> : null}
        </div>
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
