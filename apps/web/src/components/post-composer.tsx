"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bold,
  Check,
  Clock,
  Code,
  ExternalLink,
  Eye,
  Globe,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Columns2,
  PanelRight,
  Pencil,
  Quote,
  RotateCw,
  Save,
  SquareCode,
} from "lucide-react";
import type { MediaUploader } from "@/lib/builder/media-context";
import type { PostMeta } from "@/lib/content/posts";
import { renderMarkdown, readingStats } from "@/lib/content/markdown";
import { PostDetailsPanel, fileToBase64 } from "@/components/post-details-panel";

const DRAFT_PREFIX = "pagewright:post-draft:";
const DRAFT_DEBOUNCE_MS = 500;

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type ViewMode = "write" | "split" | "preview";

interface BodyDraft {
  title: string;
  description: string;
  markdown: string;
}

/**
 * Markdown-first post authoring surface. Replaces the raw-HTML textarea a post used to be edited
 * through with a real writing experience: a formatting toolbar, keyboard shortcuts, drag-drop / paste
 * image upload (committed to the repo and inserted as markdown), a live rendered preview using the
 * exact same block styles the deployed site ships, and the shared post-details panel for front-matter.
 *
 * Autosaves the body + metadata to localStorage on every keystroke (so nothing is ever lost), and the
 * explicit Save commits `{ markdown, title, description, meta }` to the repo — the server renders the
 * markdown to HTML so the generated Astro site stays dependency-free. Saves carry the loaded branch
 * head SHA for lost-update detection, surfacing a reload/overwrite banner on conflict.
 */
export function PostComposer({
  owner,
  repo,
  path,
  editingLabel,
  backHref,
  liveUrl,
  initialTitle,
  initialDescription,
  initialMarkdown,
  postMeta,
  initialHeadSha,
}: {
  owner: string;
  repo: string;
  path: string;
  editingLabel: string;
  backHref: string;
  liveUrl: string | null;
  initialTitle: string;
  initialDescription: string;
  initialMarkdown: string;
  postMeta: PostMeta;
  initialHeadSha: string | null;
}) {
  const draftKey = `${DRAFT_PREFIX}${owner}/${repo}:${path}`;
  const metaDraftKey = `${draftKey}:meta`;

  const [restoredDraft, setRestoredDraft] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [meta, setMeta] = useState<PostMeta>(postMeta);
  const [view, setView] = useState<ViewMode>("split");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const headShaRef = useRef<string | null>(initialHeadSha);
  const metaRef = useRef<PostMeta>(postMeta);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);

  // Hydrate from a locally-saved draft once on mount (kept out of initial state so SSR markup matches).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Partial<BodyDraft>;
        if (typeof d.title === "string") setTitle(d.title);
        if (typeof d.description === "string") setDescription(d.description);
        if (typeof d.markdown === "string") setMarkdown(d.markdown);
        setRestoredDraft(true);
      }
      const rawMeta = window.localStorage.getItem(metaDraftKey);
      if (rawMeta) {
        const m = { ...postMeta, ...(JSON.parse(rawMeta) as Partial<PostMeta>) };
        setMeta(m);
        metaRef.current = m;
        setRestoredDraft(true);
      }
      if (window.localStorage.getItem(draftKey) || window.localStorage.getItem(metaDraftKey)) {
        setDirty(true);
        dirtyRef.current = true;
      }
    } catch {
      // ignore corrupt drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleBodyDraft = useCallback(
    (next: BodyDraft) => {
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

  const dirtied = useCallback(() => {
    setDirty(true);
    dirtyRef.current = true;
    setSaveState((s) => (s === "saved" ? "idle" : s));
  }, []);

  const commitMarkdown = useCallback(
    (next: string) => {
      setMarkdown(next);
      dirtied();
      scheduleBodyDraft({ title, description, markdown: next });
    },
    [title, description, scheduleBodyDraft, dirtied],
  );

  const onTitle = useCallback(
    (next: string) => {
      setTitle(next);
      dirtied();
      scheduleBodyDraft({ title: next, description, markdown });
    },
    [description, markdown, scheduleBodyDraft, dirtied],
  );

  const updateMeta = useCallback(
    (patch: Partial<PostMeta>) => {
      setMeta((prev) => {
        const next = { ...prev, ...patch };
        metaRef.current = next;
        try {
          window.localStorage.setItem(metaDraftKey, JSON.stringify(next));
        } catch {
          // non-fatal
        }
        return next;
      });
      dirtied();
    },
    [metaDraftKey, dirtied],
  );

  // ── textarea editing primitives ─────────────────────────────────────────────
  const editSelection = useCallback(
    (
      mutate: (ctx: {
        value: string;
        start: number;
        end: number;
        selected: string;
      }) => { value: string; selStart: number; selEnd: number },
    ) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const { value: nextValue, selStart, selEnd } = mutate({
        value,
        start,
        end,
        selected: value.slice(start, end),
      });
      commitMarkdown(nextValue);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(selStart, selEnd);
      });
    },
    [commitMarkdown],
  );

  const wrap = useCallback(
    (before: string, after: string, placeholder: string) => {
      editSelection(({ value, start, end, selected }) => {
        const text = selected || placeholder;
        const insert = `${before}${text}${after}`;
        return {
          value: value.slice(0, start) + insert + value.slice(end),
          selStart: start + before.length,
          selEnd: start + before.length + text.length,
        };
      });
    },
    [editSelection],
  );

  const setHeading = useCallback(
    (level: number) => {
      editSelection(({ value, start }) => {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        let lineEnd = value.indexOf("\n", start);
        if (lineEnd === -1) lineEnd = value.length;
        const line = value.slice(lineStart, lineEnd).replace(/^#{1,6}\s+/, "");
        const newLine = `${"#".repeat(level)} ${line}`;
        const caret = lineStart + newLine.length;
        return {
          value: value.slice(0, lineStart) + newLine + value.slice(lineEnd),
          selStart: caret,
          selEnd: caret,
        };
      });
    },
    [editSelection],
  );

  const prefixLines = useCallback(
    (make: (index: number) => string) => {
      editSelection(({ value, start, end }) => {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        let lineEnd = value.indexOf("\n", end);
        if (lineEnd === -1) lineEnd = value.length;
        const block = value.slice(lineStart, lineEnd);
        const out = block
          .split("\n")
          .map((l, i) => make(i) + l)
          .join("\n");
        return {
          value: value.slice(0, lineStart) + out + value.slice(lineEnd),
          selStart: lineStart,
          selEnd: lineStart + out.length,
        };
      });
    },
    [editSelection],
  );

  const insertAtCursor = useCallback(
    (snippet: string) => {
      editSelection(({ value, start, end }) => {
        const caret = start + snippet.length;
        return {
          value: value.slice(0, start) + snippet + value.slice(end),
          selStart: caret,
          selEnd: caret,
        };
      });
    },
    [editSelection],
  );

  // ── image upload (drag / paste / picker) ────────────────────────────────────
  const uploader = useMemo<MediaUploader>(
    () => ({
      async upload(file) {
        const contentBase64 = await fileToBase64(file);
        const res = await fetch(`/api/sites/${owner}/${repo}/media`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64 }),
        });
        const body = (await res.json().catch(() => null)) as
          | { url?: string; path?: string; error?: string }
          | null;
        if (!res.ok || !body?.url) throw new Error(body?.error ?? "Upload failed.");
        return { url: body.url, path: body.path ?? "" };
      },
    }),
    [owner, repo],
  );

  const uploadImages = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      for (const file of images) {
        const marker = `pw-uploading-${Math.random().toString(36).slice(2)}`;
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        insertAtCursor(`![${alt}](${marker})\n`);
        setUploading((n) => n + 1);
        try {
          const { url } = await uploader.upload(file);
          setMarkdown((prev) => {
            const next = prev.replace(marker, url);
            scheduleBodyDraft({ title, description, markdown: next });
            return next;
          });
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Image upload failed.");
          setSaveState("error");
          setMarkdown((prev) => prev.replace(`![${alt}](${marker})\n`, ""));
        } finally {
          setUploading((n) => Math.max(0, n - 1));
        }
      }
    },
    [uploader, insertAtCursor, scheduleBodyDraft, title, description],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) void uploadImages(files);
    },
    [uploadImages],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files ?? []);
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length) {
        e.preventDefault();
        void uploadImages(images);
      }
    },
    [uploadImages],
  );

  // ── save ────────────────────────────────────────────────────────────────────
  const save = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      setSaveState("saving");
      setMessage(null);
      try {
        const res = await fetch(`/api/sites/${owner}/${repo}/pages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path,
            markdown,
            title,
            description,
            meta: metaRef.current,
            expectedHeadSha: force ? undefined : headShaRef.current ?? undefined,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | { error?: string; code?: string; headSha?: string }
          | null;
        if (res.status === 409 || body?.code === "conflict") {
          setSaveState("conflict");
          setMessage(body?.error ?? "This post changed somewhere else since you started editing.");
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
        setDirty(false);
        dirtyRef.current = false;
        setSaveState("saved");
        setMessage(
          metaRef.current.draft
            ? "Saved as draft — deploying (hidden until published)"
            : "Saved — deploying your post",
        );
      } catch {
        setSaveState("error");
        setMessage("Network error while saving. Your work is kept locally.");
      }
    },
    [owner, repo, path, markdown, title, description, draftKey, metaDraftKey],
  );

  const onReload = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(metaDraftKey);
    } catch {
      // ignore
    }
    window.location.reload();
  }, [draftKey, metaDraftKey]);

  // ── keyboard shortcuts (scoped to the textarea) ─────────────────────────────
  const outdent = useCallback(() => {
    editSelection(({ value, start, end }) => {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = value.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = value.length;
      const block = value.slice(lineStart, lineEnd);
      let removedFirst = 0;
      const out = block
        .split("\n")
        .map((l, i) => {
          const m = l.match(/^( {1,2}|\t)/);
          const cut = m ? m[0].length : 0;
          if (i === 0) removedFirst = cut;
          return l.slice(cut);
        })
        .join("\n");
      return {
        value: value.slice(0, lineStart) + out + value.slice(lineEnd),
        selStart: Math.max(lineStart, start - removedFirst),
        selEnd: lineStart + out.length,
      };
    });
  }, [editSelection]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab traps focus and indents (a standard editor nicety) rather than leaving the field.
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = taRef.current;
        if (e.shiftKey) {
          outdent();
        } else if (ta && ta.selectionStart !== ta.selectionEnd) {
          prefixLines(() => "  ");
        } else {
          insertAtCursor("  ");
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        wrap("**", "**", "bold text");
      } else if (k === "i") {
        e.preventDefault();
        wrap("*", "*", "italic text");
      } else if (k === "k") {
        e.preventDefault();
        wrap("[", "](https://)", "link text");
      } else if (k === "s") {
        e.preventDefault();
        void save();
      }
    },
    [wrap, save, outdent, prefixLines, insertAtCursor],
  );

  // Warn before leaving with unsaved changes (drafts are local until an explicit Save commits).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Auto-dismiss the "Saved" confirmation so the toolbar returns to a calm state.
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2600);
    return () => clearTimeout(t);
  }, [saveState]);

  // Escape closes the details panel.
  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen]);

  const stats = useMemo(() => readingStats(markdown), [markdown]);
  const previewHtml = useMemo(() => renderMarkdown(markdown), [markdown]);
  const showWrite = view !== "preview";
  const showPreview = view !== "write";

  // Live publish status derived from the metadata, surfaced as a header badge so authors
  // always know whether the post is hidden, queued, or public without opening details.
  const status = useMemo<{ kind: "draft" | "scheduled" | "public"; label: string }>(() => {
    if (meta.draft) return { kind: "draft", label: "Draft" };
    const at = meta.publishAt ? new Date(meta.publishAt).getTime() : 0;
    if (at && at > Date.now()) {
      const when = new Date(meta.publishAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      return { kind: "scheduled", label: `Scheduled · ${when}` };
    }
    return { kind: "public", label: "Public" };
  }, [meta.draft, meta.publishAt]);

  const tools: {
    key: string;
    label: string;
    icon: React.ReactNode;
    run: () => void;
    group: number;
  }[] = [
    { key: "h1", label: "Heading 1", icon: <Heading1 size={16} />, run: () => setHeading(1), group: 0 },
    { key: "h2", label: "Heading 2", icon: <Heading2 size={16} />, run: () => setHeading(2), group: 0 },
    { key: "h3", label: "Heading 3", icon: <Heading3 size={16} />, run: () => setHeading(3), group: 0 },
    { key: "bold", label: "Bold  (⌘B)", icon: <Bold size={16} />, run: () => wrap("**", "**", "bold text"), group: 1 },
    { key: "italic", label: "Italic  (⌘I)", icon: <Italic size={16} />, run: () => wrap("*", "*", "italic text"), group: 1 },
    { key: "code", label: "Inline code", icon: <Code size={16} />, run: () => wrap("`", "`", "code"), group: 1 },
    { key: "link", label: "Link  (⌘K)", icon: <Link2 size={16} />, run: () => wrap("[", "](https://)", "link text"), group: 1 },
    { key: "quote", label: "Quote", icon: <Quote size={16} />, run: () => prefixLines(() => "> "), group: 2 },
    { key: "ul", label: "Bulleted list", icon: <List size={16} />, run: () => prefixLines(() => "- "), group: 2 },
    { key: "ol", label: "Numbered list", icon: <ListOrdered size={16} />, run: () => prefixLines((i) => `${i + 1}. `), group: 2 },
    { key: "codeblock", label: "Code block", icon: <SquareCode size={16} />, run: () => wrap("```\n", "\n```", "code"), group: 2 },
    { key: "image", label: "Insert image", icon: <ImageIcon size={16} />, run: () => imageInputRef.current?.click(), group: 3 },
  ];

  return (
    <div className="pw-composer">
      <div className="pw-editor__bar">
        <Link href={backHref} className="pw-editor__back">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to posts</span>
        </Link>
        <div className="pw-editor__titlewrap">
          <span className="pw-editor__title">{editingLabel}</span>
          <span
            className={`pw-statusbadge pw-statusbadge--${status.kind}`}
            title={
              status.kind === "draft"
                ? "Hidden from the published site"
                : status.kind === "scheduled"
                  ? "Stays hidden until the scheduled time"
                  : "Visible on the published site"
            }
          >
            {status.kind === "scheduled" ? (
              <Clock size={12} aria-hidden="true" />
            ) : (
              <span className="pw-statusbadge__dot" aria-hidden="true" />
            )}
            <span>{status.label}</span>
          </span>
        </div>
        <div className="pw-editor__baractions">
          <div className="pw-viewtoggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`pw-viewtoggle__btn${view === "write" ? " is-active" : ""}`}
              onClick={() => setView("write")}
              title="Write only"
            >
              <Pencil size={14} aria-hidden="true" />
              <span>Write</span>
            </button>
            <button
              type="button"
              className={`pw-viewtoggle__btn${view === "split" ? " is-active" : ""}`}
              onClick={() => setView("split")}
              title="Split view"
            >
              <Columns2 size={14} aria-hidden="true" />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={`pw-viewtoggle__btn${view === "preview" ? " is-active" : ""}`}
              onClick={() => setView("preview")}
              title="Preview only"
            >
              <Eye size={14} aria-hidden="true" />
              <span>Preview</span>
            </button>
          </div>
          <SaveStatus state={saveState} message={message} dirty={dirty} restored={restoredDraft} />
          {liveUrl ? (
            <a className="pw-linkpill" href={liveUrl} target="_blank" rel="noreferrer">
              <Globe size={14} aria-hidden="true" />
              <span>View live</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            className={`pw-btn pw-btn--ghost pw-btn--sm${detailsOpen ? " pw-btn--active" : ""}`}
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            title="Post details (Esc to close)"
          >
            <PanelRight size={15} aria-hidden="true" />
            <span>Details</span>
          </button>
          <button
            type="button"
            className="pw-btn pw-btn--primary pw-btn--sm"
            onClick={() => void save()}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? (
              <Loader2 size={15} className="pw-spin" aria-hidden="true" />
            ) : (
              <Save size={15} aria-hidden="true" />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>

      {saveState === "conflict" ? (
        <div className="pw-editor__conflict" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="pw-editor__conflicttext">
            {message ?? "This post changed somewhere else since you started editing."}
          </span>
          <button type="button" className="pw-btn pw-btn--ghost" onClick={onReload}>
            <RotateCw size={14} aria-hidden="true" /> Reload latest
          </button>
          <button type="button" className="pw-btn pw-btn--primary" onClick={() => void save({ force: true })}>
            Overwrite with my version
          </button>
        </div>
      ) : null}

      <div className="pw-composer__body">
        <div className="pw-composer__main">
          <div className="pw-composer__titlerow">
            <input
              className="pw-composer__titleinput"
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="Post title"
              aria-label="Post title"
            />
          </div>

          <div className="pw-composer__toolbar" role="toolbar" aria-label="Formatting">
            {tools.map((t, i) => (
              <Fragment key={t.key}>
                {i > 0 && tools[i - 1]!.group !== t.group ? (
                  <span className="pw-composer__tooldiv" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  className="pw-composer__tool"
                  title={t.label}
                  aria-label={t.label}
                  onClick={t.run}
                >
                  {t.icon}
                </button>
              </Fragment>
            ))}
            <span className="pw-composer__stats" aria-live="polite">
              {uploading > 0 ? (
                <>
                  <Loader2 size={13} className="pw-spin" aria-hidden="true" />
                  <span>Uploading {uploading} image{uploading > 1 ? "s" : ""}…</span>
                </>
              ) : (
                <span>
                  {stats.words} word{stats.words === 1 ? "" : "s"} · {stats.minutes} min read
                </span>
              )}
            </span>
          </div>

          <div className={`pw-composer__panes pw-composer__panes--${view}`}>
            {showWrite ? (
              <div
                className={`pw-composer__writepane${dragActive ? " is-dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <textarea
                  ref={taRef}
                  className="pw-composer__textarea"
                  value={markdown}
                  onChange={(e) => commitMarkdown(e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  placeholder="Write your post in markdown…  Drag an image in to upload it."
                  spellCheck
                />
                {dragActive ? (
                  <div className="pw-composer__drophint" aria-hidden="true">
                    <ImageIcon size={22} />
                    <span>Drop images to upload</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {showPreview ? (
              <div className="pw-composer__previewpane">
                {markdown.trim() ? (
                  <article
                    className="pw-prose pw-composer__preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <div className="pw-composer__previewempty">Your rendered post will appear here.</div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <aside
          className={`pw-composer__side${detailsOpen ? " is-open" : ""}`}
          aria-hidden={!detailsOpen}
        >
          <PostDetailsPanel
            meta={meta}
            onChange={updateMeta}
            onClose={() => setDetailsOpen(false)}
            uploader={uploader}
            variant="panel"
          />
        </aside>

        {detailsOpen ? (
          <button
            type="button"
            className="pw-composer__scrim"
            aria-label="Close post details"
            onClick={() => setDetailsOpen(false)}
          />
        ) : null}
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadImages(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SaveStatus({
  state,
  message,
  dirty,
  restored,
}: {
  state: SaveState;
  message: string | null;
  dirty: boolean;
  restored: boolean;
}) {
  if (state === "saving") {
    return (
      <span className="pw-editor__savebadge pw-editor__savebadge--saving">
        <Loader2 size={14} className="pw-spin" aria-hidden="true" />
        <span>Saving…</span>
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="pw-editor__savebadge pw-editor__savebadge--saved">
        <Check size={14} aria-hidden="true" />
        <span>{message ?? "Saved"}</span>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="pw-editor__savebadge pw-editor__savebadge--error">
        <AlertCircle size={14} aria-hidden="true" />
        <span>{message ?? "Error"}</span>
      </span>
    );
  }
  // idle / conflict — surface unsaved work (including a recovered local draft) as a gentle nudge.
  if (dirty) {
    return (
      <span className="pw-editor__savebadge pw-editor__savebadge--dirty">
        <span className="pw-editor__unsaveddot" aria-hidden="true" />
        <span>{restored ? "Unsaved draft" : "Unsaved changes"}</span>
      </span>
    );
  }
  return null;
}
