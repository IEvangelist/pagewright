"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bold,
  Clock,
  Check,
  Code,
  ExternalLink,
  Eye,
  Globe,
  GripVertical,
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
  FileText,
  MessageSquare,
  PanelRight,
  Pencil,
  Plus,
  Quote,
  RotateCw,
  Save,
  SquareCode,
  Trash2,
} from "lucide-react";
import {
  MEDIA_UPLOAD_ACCEPT,
  resolveMediaPreviewUrl,
  type MediaUploader,
} from "@/lib/builder/media-context";
import type { PostMeta } from "@/lib/content/posts";
import { renderMarkdown, readingStats } from "@/lib/content/markdown";
import {
  RepositoryConflictError,
  useRepositoryWriteQueue,
} from "@/lib/repository-write-queue";
import { PostDetailsPanel, fileToBase64 } from "@/components/post-details-panel";
import {
  EditorSiteStatus,
  type EditorSaveState,
} from "@/components/editor-site-status";
import type { DiscussionSetup } from "@pagewright/github";
import {
  applyLegacyMarkdownDraft,
  createPostComponent,
  createSiteBindings,
  getGitHubDiscussionsConfigIssues,
  movePostComponent,
  postComponentRegistry,
  postComponentsSchema,
  removePostComponent,
  resolveHtmlBindingString,
  updatePostComponent,
  type BlockProps,
  type PostComponent,
  type PostComponentType,
  type SiteConfig,
} from "@pagewright/blocks";

const DRAFT_PREFIX = "pagewright:post-draft:";
const DRAFT_DEBOUNCE_MS = 500;
const PENDING_IMAGE_SOURCE =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

type ViewMode = "write" | "split" | "preview";

interface BodyDraft {
  title: string;
  description: string;
  components: PostComponent[];
}

function rewriteMediaPreviewSources(html: string, mediaPreviewEndpoint: string): string {
  return html.replace(
    /\bsrc=(["'])(\/media\/[^"']+)\1/gi,
    (_match: string, quote: string, value: string) =>
      `src=${quote}${resolveMediaPreviewUrl(value, mediaPreviewEndpoint) ?? value}${quote}`,
  );
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
  initialComponents,
  postMeta,
  initialHeadSha,
  initialDiscussionSetup,
  site,
  supportsGlobalFeatures,
}: {
  owner: string;
  repo: string;
  path: string;
  editingLabel: string;
  backHref: string;
  liveUrl: string | null;
  initialTitle: string;
  initialDescription: string;
  initialComponents: PostComponent[];
  postMeta: PostMeta;
  initialHeadSha: string;
  initialDiscussionSetup: DiscussionSetup | null;
  site: SiteConfig;
  supportsGlobalFeatures: boolean;
}) {
  const draftKey = `${DRAFT_PREFIX}${owner}/${repo}:${path}`;
  const metaDraftKey = `${draftKey}:meta`;
  const mediaPreviewEndpoint = `/api/sites/${owner}/${repo}/media`;
  const draftBaseKey = `${draftKey}:base`;

  const [restoredDraft, setRestoredDraft] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [components, setComponents] = useState(initialComponents);
  const [activeId, setActiveId] = useState(initialComponents[0]?.id ?? "");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [meta, setMeta] = useState<PostMeta>(postMeta);
  const [view, setView] = useState<ViewMode>("split");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveState, setSaveState] = useState<EditorSaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictSource, setConflictSource] = useState<
    "save" | "upload" | "restored" | null
  >(null);
  const [deployHeadSha, setDeployHeadSha] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingBodyDraftRef = useRef<BodyDraft | null>(null);
  const enqueueRepositoryWrite = useRepositoryWriteQueue(initialHeadSha);
  const metaRef = useRef<PostMeta>(postMeta);
  const componentsRef = useRef(initialComponents);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);
  const editRevisionRef = useRef(0);
  const uploadingRef = useRef(0);
  const conflictRef = useRef(false);
  const draftBaseHeadShaRef = useRef<string | null>(initialHeadSha);
  const persistDraftBase = useCallback(() => {
    if (conflictRef.current) return;
    window.localStorage.setItem(
      draftBaseKey,
      JSON.stringify({ baseHeadSha: draftBaseHeadShaRef.current }),
    );
  }, [draftBaseKey]);

  const activeComponent = components.find((component) => component.id === activeId);
  const markdown =
    activeComponent?.type === "prose" ? (activeComponent.props.markdown ?? "") : "";

  // Hydrate from a locally-saved draft once on mount (kept out of initial state so SSR markup matches).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Partial<BodyDraft> & { markdown?: unknown };
        if (typeof d.title === "string") setTitle(d.title);
        if (typeof d.description === "string") setDescription(d.description);
        const parsedComponents = postComponentsSchema.safeParse(d.components);
        if (parsedComponents.success) {
          setComponents(parsedComponents.data);
          componentsRef.current = parsedComponents.data;
          setActiveId(parsedComponents.data[0]?.id ?? "");
        } else if (typeof d.markdown === "string") {
          const migrated = applyLegacyMarkdownDraft(initialComponents, d.markdown);
          setComponents(migrated);
          componentsRef.current = migrated;
          setActiveId(migrated[0]?.id ?? "");
        }
        setRestoredDraft(true);
      }
      const rawMeta = window.localStorage.getItem(metaDraftKey);
      if (rawMeta) {
        const m = { ...postMeta, ...(JSON.parse(rawMeta) as Partial<PostMeta>) };
        setMeta(m);
        metaRef.current = m;
        setRestoredDraft(true);
      }
      const hasDraft = Boolean(raw || rawMeta);
      if (hasDraft) {
        setDirty(true);
        dirtyRef.current = true;
      }
      const rawBase = window.localStorage.getItem(draftBaseKey);
      let restoredBaseHeadSha: string | null | undefined;
      if (rawBase) {
        try {
          const parsed = JSON.parse(rawBase) as { baseHeadSha?: unknown };
          if (typeof parsed.baseHeadSha === "string" || parsed.baseHeadSha === null) {
            restoredBaseHeadSha = parsed.baseHeadSha;
          }
        } catch {
          // Treat a corrupt base marker like a legacy draft with an unknown base.
        }
      }
      if (hasDraft) {
        if (restoredBaseHeadSha !== undefined) {
          draftBaseHeadShaRef.current = restoredBaseHeadSha;
        }
        if (restoredBaseHeadSha === undefined || restoredBaseHeadSha !== initialHeadSha) {
          conflictRef.current = true;
          setSaveState("conflict");
          setConflictSource("restored");
          setMessage(
            "Your edits were restored from before a newer repository version. Reload latest to discard them, or explicitly overwrite with your version.",
          );
        }
      } else if (rawBase) {
        window.localStorage.removeItem(draftBaseKey);
      }
    } catch {
      setSaveState("error");
      setMessage("Local backup couldn’t be restored. The latest GitHub version is open.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeBodyDraft = useCallback(
    (next: BodyDraft, surfaceError: boolean) => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(next));
        persistDraftBase();
        if (pendingBodyDraftRef.current === next) pendingBodyDraftRef.current = null;
      } catch (error) {
        if (surfaceError) {
          setSaveState("error");
          setMessage("Local backup is unavailable. Save before leaving this page.");
        } else {
          console.error("[pagewright] Failed to flush the local post draft.", error);
        }
      }
    },
    [draftKey, persistDraftBase],
  );

  const scheduleBodyDraft = useCallback(
    (next: BodyDraft) => {
      pendingBodyDraftRef.current = next;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = undefined;
        writeBodyDraft(next, true);
      }, DRAFT_DEBOUNCE_MS);
    },
    [writeBodyDraft],
  );

  const flushBodyDraft = useCallback(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = undefined;
    }
    if (pendingBodyDraftRef.current) writeBodyDraft(pendingBodyDraftRef.current, false);
  }, [writeBodyDraft]);

  useEffect(() => {
    window.addEventListener("pagehide", flushBodyDraft);
    return () => {
      window.removeEventListener("pagehide", flushBodyDraft);
      flushBodyDraft();
    };
  }, [flushBodyDraft]);

  const dirtied = useCallback(() => {
    editRevisionRef.current++;
    setDirty(true);
    dirtyRef.current = true;
    setSaveState((s) => (s === "saved" ? "idle" : s));
  }, []);

  const commitComponents = useCallback(
    (update: (current: PostComponent[]) => PostComponent[]) => {
      setComponents((current) => {
        const next = update(current);
        componentsRef.current = next;
        scheduleBodyDraft({ title, description, components: next });
        return next;
      });
      dirtied();
    },
    [title, description, scheduleBodyDraft, dirtied],
  );

  const commitMarkdown = useCallback(
    (next: string) => {
      if (!activeId) return;
      commitComponents((current) =>
        updatePostComponent<"prose">(current, activeId, { markdown: next, html: "" }),
      );
    },
    [activeId, commitComponents],
  );

  const onTitle = useCallback(
    (next: string) => {
      setTitle(next);
      dirtied();
      scheduleBodyDraft({ title: next, description, components: componentsRef.current });
    },
    [description, scheduleBodyDraft, dirtied],
  );

  const updateMeta = useCallback(
    (patch: Partial<PostMeta>) => {
      const next = { ...metaRef.current, ...patch };
      metaRef.current = next;
      setMeta(next);
      try {
        window.localStorage.setItem(metaDraftKey, JSON.stringify(next));
        persistDraftBase();
      } catch {
        setSaveState("error");
        setMessage("Local backup is unavailable. Save before leaving this page.");
      }
      dirtied();
    },
    [metaDraftKey, dirtied, persistDraftBase],
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
      async upload(file, apply) {
        if (conflictRef.current) {
          throw new RepositoryConflictError(
            "Resolve the version conflict before uploading another image.",
          );
        }
        uploadingRef.current++;
        setUploading(uploadingRef.current);
        try {
          const media = await enqueueRepositoryWrite(async (expectedHeadSha) => {
            const contentBase64 = await fileToBase64(file);
            const res = await fetch(mediaPreviewEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                contentBase64,
                expectedHeadSha,
              }),
            });
            const body = (await res.json().catch(() => null)) as
              | {
                  url?: string;
                  path?: string;
                  error?: string;
                  code?: string;
                  headSha?: string;
                }
              | null;
            if (res.status === 409 || body?.code === "conflict") {
              const conflictMessage =
                body?.error ?? "This site changed somewhere else while the image was uploading.";
              conflictRef.current = true;
              draftBaseHeadShaRef.current = expectedHeadSha;
              setSaveState("conflict");
              setConflictSource("upload");
              setMessage(conflictMessage);
              throw new RepositoryConflictError(conflictMessage);
            }
            if (!res.ok || !body?.url || !body.path) {
              throw new Error(body?.error ?? "Upload failed.");
            }
            if (body.headSha) {
              setDeployHeadSha(body.headSha);
              draftBaseHeadShaRef.current = body.headSha;
              try {
                persistDraftBase();
              } catch {
                // non-fatal
              }
            }
            return {
              value: { url: body.url, path: body.path },
              headSha: body.headSha,
            };
          });
          apply(media);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } finally {
          uploadingRef.current = Math.max(0, uploadingRef.current - 1);
          setUploading(uploadingRef.current);
        }
      },
      previewUrl: (value) => resolveMediaPreviewUrl(value, mediaPreviewEndpoint) ?? value,
    }),
    [mediaPreviewEndpoint, enqueueRepositoryWrite, persistDraftBase],
  );

  const uploadImages = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      const targetId = activeComponent?.type === "prose" ? activeComponent.id : null;
      if (images.length === 0 || !targetId) return;
      for (const file of images) {
        const marker = `${PENDING_IMAGE_SOURCE}#pw-uploading-${Math.random().toString(36).slice(2)}`;
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        insertAtCursor(`![${alt}](${marker})\n`);
        try {
          await uploader.upload(file, ({ url }) => {
            commitComponents((current) => {
              const target = current.find(
                (component): component is Extract<PostComponent, { type: "prose" }> =>
                  component.id === targetId && component.type === "prose",
              );
              if (!target) return current;
              return updatePostComponent<"prose">(current, targetId, {
                markdown: (target.props.markdown ?? "").replace(marker, url),
                html: "",
              });
            });
          });
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Image upload failed.");
          setSaveState(err instanceof RepositoryConflictError ? "conflict" : "error");
          commitComponents((current) => {
            const target = current.find(
              (component): component is Extract<PostComponent, { type: "prose" }> =>
                component.id === targetId && component.type === "prose",
            );
            if (!target) return current;
            return updatePostComponent<"prose">(current, targetId, {
              markdown: (target.props.markdown ?? "").replace(`![${alt}](${marker})\n`, ""),
              html: "",
            });
          });
        }
      }
    },
    [activeComponent, uploader, insertAtCursor, commitComponents],
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
      if (uploadingRef.current > 0) {
        setSaveState("error");
        setMessage("Wait for image uploads to finish before saving.");
        return;
      }
      if (conflictRef.current && !force) {
        setSaveState("conflict");
        setMessage(
          "Resolve the version conflict before saving, or explicitly overwrite with your version.",
        );
        return;
      }
      const savedRevision = editRevisionRef.current;
      return enqueueRepositoryWrite(async (expectedHeadSha) => {
        setSaveState("saving");
        setMessage(null);
        setConflictSource(null);
        try {
          const res = await fetch(`/api/sites/${owner}/${repo}/pages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              path,
              blocks: components,
              title,
              description,
              meta: metaRef.current,
              expectedHeadSha: force ? undefined : expectedHeadSha,
            }),
          });
          const body = (await res.json().catch(() => null)) as
            | { error?: string; code?: string; headSha?: string }
            | null;
          if (res.status === 409 || body?.code === "conflict") {
            conflictRef.current = true;
            draftBaseHeadShaRef.current = expectedHeadSha;
            setSaveState("conflict");
            setConflictSource("save");
            setMessage(body?.error ?? "This post changed somewhere else since you started editing.");
            return { value: undefined };
          }
          if (!res.ok) {
            setSaveState("error");
            setMessage(body?.error ?? "Couldn’t save your changes.");
            return { value: undefined };
          }
          conflictRef.current = false;
          if (body?.headSha) draftBaseHeadShaRef.current = body.headSha;
          const isCurrentRevision = editRevisionRef.current === savedRevision;
          if (isCurrentRevision) {
            if (draftTimer.current) {
              clearTimeout(draftTimer.current);
              draftTimer.current = undefined;
            }
            pendingBodyDraftRef.current = null;
            let localBackupCleared = true;
            try {
              window.localStorage.removeItem(draftKey);
              window.localStorage.removeItem(metaDraftKey);
              window.localStorage.removeItem(draftBaseKey);
            } catch (error) {
              localBackupCleared = false;
              console.error("[pagewright] Failed to clear the saved local post draft.", error);
            }
            setRestoredDraft(false);
            setDirty(false);
            dirtyRef.current = false;
            setSaveState("saved");
            const successMessage =
              metaRef.current.draft
                ? "Saved as draft. It stays hidden until published."
                : "Saved. Your post is deploying now.";
            setMessage(
              localBackupCleared
                ? successMessage
                : `${successMessage} Clear this site’s browser data before editing again.`,
            );
          } else {
            try {
              persistDraftBase();
            } catch {
              // non-fatal
            }
            setSaveState("idle");
            setMessage(null);
          }
          if (body?.headSha) setDeployHeadSha(body.headSha);
          return { value: undefined, headSha: body?.headSha };
        } catch {
          setSaveState("error");
          setMessage("Network error while saving. Your work is kept locally.");
          return { value: undefined };
        }
      });
    },
    [
      owner,
      repo,
      path,
      components,
      title,
      description,
      draftKey,
      metaDraftKey,
      draftBaseKey,
      enqueueRepositoryWrite,
      persistDraftBase,
    ],
  );

  const onReload = useCallback(() => {
    if (
      conflictSource !== "upload" &&
      !window.confirm(
        "Discard your local post edits and load the latest version from GitHub? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      if (conflictSource === "upload") {
        if (draftTimer.current) {
          clearTimeout(draftTimer.current);
          draftTimer.current = undefined;
        }
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            description,
            components: componentsRef.current,
          } satisfies BodyDraft),
        );
        window.localStorage.setItem(metaDraftKey, JSON.stringify(metaRef.current));
        window.localStorage.setItem(
          draftBaseKey,
          JSON.stringify({ baseHeadSha: draftBaseHeadShaRef.current }),
        );
      } else {
        window.localStorage.removeItem(draftKey);
        window.localStorage.removeItem(metaDraftKey);
        window.localStorage.removeItem(draftBaseKey);
      }
    } catch {
      setSaveState("error");
      setMessage(
        conflictSource === "upload"
          ? "Couldn’t preserve your local edits. Copy your changes before reloading."
          : "The local draft couldn’t be cleared. Your edits were not discarded.",
      );
      return;
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    pendingBodyDraftRef.current = null;
    window.location.reload();
  }, [
    conflictSource,
    description,
    draftKey,
    metaDraftKey,
    draftBaseKey,
    title,
  ]);

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
        if (uploadingRef.current === 0 && !conflictRef.current) void save();
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

  const addComponent = useCallback(
    (type: PostComponentType) => {
      const id = `${type}-${crypto.randomUUID()}`;
      const defaultCategory =
        initialDiscussionSetup?.categories.find((category) => category.name === "Announcements") ??
        initialDiscussionSetup?.categories[0];
      const component =
        type === "prose"
          ? createPostComponent("prose", { id })
          : createPostComponent("githubDiscussions", {
              id,
              repo: initialDiscussionSetup?.repo ?? `${owner}/${repo}`,
              repoId: initialDiscussionSetup?.repoId ?? "",
              category: defaultCategory?.name ?? "",
              categoryId: defaultCategory?.id ?? "",
            });
      commitComponents((current) => [...current, component]);
      setActiveId(component.id);
    },
    [owner, repo, initialDiscussionSetup, commitComponents],
  );

  const moveComponent = useCallback(
    (id: string, offset: number) => {
      commitComponents((current) => {
        const index = current.findIndex((component) => component.id === id);
        return movePostComponent(current, id, index + offset);
      });
    },
    [commitComponents],
  );

  const dropComponent = useCallback(
    (targetIndex: number) => {
      if (!draggedId) return;
      commitComponents((current) => movePostComponent(current, draggedId, targetIndex));
      setDraggedId(null);
    },
    [draggedId, commitComponents],
  );

  const deleteComponent = useCallback(
    (id: string) => {
      const index = components.findIndex((component) => component.id === id);
      const remaining = removePostComponent(components, id);
      commitComponents(() => remaining);
      if (activeId === id) {
        setActiveId(remaining[Math.min(index, remaining.length - 1)]?.id ?? "");
      }
    },
    [components, activeId, commitComponents],
  );

  const updateDiscussion = useCallback(
    (patch: Partial<BlockProps<"githubDiscussions">>) => {
      if (activeComponent?.type !== "githubDiscussions") return;
      commitComponents((current) =>
        updatePostComponent<"githubDiscussions">(current, activeComponent.id, patch),
      );
    },
    [activeComponent, commitComponents],
  );

  const allMarkdown = useMemo(
    () =>
      components
        .filter(
          (component): component is Extract<PostComponent, { type: "prose" }> =>
            component.type === "prose",
        )
        .map((component) => component.props.markdown ?? "")
        .join("\n\n"),
    [components],
  );
  const stats = useMemo(() => readingStats(allMarkdown), [allMarkdown]);
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
        <Link href={backHref} className="pw-editor__back" aria-label="Back to posts">
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
          <EditorSiteStatus
            owner={owner}
            repo={repo}
            saveState={saveState}
            saveMessage={message}
            dirty={dirty}
            restored={restoredDraft}
            uploading={uploading}
            targetHeadSha={deployHeadSha}
          />
          {liveUrl ? (
            <a
              className="pw-linkpill"
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="View live site"
            >
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
            disabled={saveState === "saving" || saveState === "conflict" || uploading > 0}
            aria-label={uploading > 0 ? "Wait for image upload to finish" : "Save post"}
            title={uploading > 0 ? "Wait for image upload to finish" : undefined}
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

      {saveState === "error" ? (
        <div className="pw-editor__error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{message ?? "Something went wrong. Your latest changes were not saved."}</span>
        </div>
      ) : null}

      {saveState === "conflict" ? (
        <div className="pw-editor__conflict" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span className="pw-editor__conflicttext">
            {message ?? "This post changed somewhere else since you started editing."}
          </span>
          <button type="button" className="pw-btn pw-btn--ghost" onClick={onReload}>
            <RotateCw size={14} aria-hidden="true" />
            {conflictSource === "upload" ? "Reload and keep edits" : "Reload latest"}
          </button>
          {conflictSource !== "upload" ? (
            <button
              type="button"
              className="pw-btn pw-btn--primary"
              onClick={() => void save({ force: true })}
            >
              Overwrite with my version
            </button>
          ) : null}
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

          <ComponentRail
            components={components}
            activeId={activeId}
            draggedId={draggedId}
            onSelect={setActiveId}
            onAdd={addComponent}
            onMove={moveComponent}
            onDelete={deleteComponent}
            onDragStart={setDraggedId}
            onDrop={dropComponent}
          />

          {activeComponent?.type === "prose" ? (
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
          ) : (
            <div className="pw-composer__componentbar">
              <MessageSquare size={16} aria-hidden="true" />
              <span>Configure GitHub Discussions</span>
            </div>
          )}

          <div className={`pw-composer__panes pw-composer__panes--${view}`}>
            {showWrite ? (
              activeComponent?.type === "prose" ? (
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
                    placeholder="Write this text component in Markdown. Drag an image in to upload it."
                    spellCheck
                  />
                  {dragActive ? (
                    <div className="pw-composer__drophint" aria-hidden="true">
                      <ImageIcon size={22} />
                      <span>Drop images to upload</span>
                    </div>
                  ) : null}
                </div>
              ) : activeComponent?.type === "githubDiscussions" ? (
                <DiscussionFields
                  value={activeComponent.props}
                  sourceRepo={`${owner}/${repo}`}
                  initialSetup={initialDiscussionSetup}
                  setupEndpoint={`/api/sites/${owner}/${repo}/discussions`}
                  onChange={updateDiscussion}
                />
              ) : (
                <div className="pw-composer__componentempty">
                  <strong>Add a post component</strong>
                  <span>Start with text, then add comments wherever they belong.</span>
                  <button type="button" className="pw-btn pw-btn--primary" onClick={() => addComponent("prose")}>
                    <Plus size={15} aria-hidden="true" />
                    Add text
                  </button>
                </div>
              )
            ) : null}
            {showPreview ? (
              <div className="pw-composer__previewpane">
                <PostComponentsPreview
                  components={components}
                  mediaPreviewEndpoint={mediaPreviewEndpoint}
                  site={site}
                  supportsGlobalFeatures={supportsGlobalFeatures}
                />
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
        accept={MEDIA_UPLOAD_ACCEPT}
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

function ComponentRail({
  components,
  activeId,
  draggedId,
  onSelect,
  onAdd,
  onMove,
  onDelete,
  onDragStart,
  onDrop,
}: {
  components: PostComponent[];
  activeId: string;
  draggedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: PostComponentType) => void;
  onMove: (id: string, offset: number) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string | null) => void;
  onDrop: (index: number) => void;
}) {
  const hasDiscussion = components.some((component) => component.type === "githubDiscussions");
  return (
    <div className="pw-components" aria-label="Post components">
      <div className="pw-components__head">
        <div>
          <strong>Post components</strong>
          <span>Each item is a section. Select one to edit it; its order here is its order in the post.</span>
        </div>
        <div className="pw-components__add">
          <button type="button" className="pw-btn pw-btn--ghost pw-btn--sm" onClick={() => onAdd("prose")}>
            <FileText size={14} aria-hidden="true" />
            Add text
          </button>
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm"
            onClick={() => onAdd("githubDiscussions")}
            disabled={hasDiscussion}
            title={hasDiscussion ? "This post already has a discussion section." : undefined}
          >
            <MessageSquare size={14} aria-hidden="true" />
            Add discussion
          </button>
        </div>
      </div>
      {components.length > 0 ? (
        <div className="pw-components__list" role="list">
          {components.map((component, index) => {
            const definition = postComponentRegistry[component.type];
            const active = component.id === activeId;
            return (
              <div
                key={component.id}
                className={`pw-components__item${active ? " is-active" : ""}${draggedId === component.id ? " is-dragging" : ""}`}
                role="listitem"
                draggable
                onDragStart={() => onDragStart(component.id)}
                onDragEnd={() => onDragStart(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onDrop(index);
                }}
              >
                <GripVertical className="pw-components__grip" size={16} aria-hidden="true" />
                <button
                  type="button"
                  className="pw-components__select"
                  onClick={() => onSelect(component.id)}
                  aria-pressed={active}
                >
                  {component.type === "prose" ? (
                    <FileText size={15} aria-hidden="true" />
                  ) : (
                    <MessageSquare size={15} aria-hidden="true" />
                  )}
                  <span>{definition.label}</span>
                  <small>{index + 1}</small>
                </button>
                <div className="pw-components__actions">
                  <button
                    type="button"
                    onClick={() => onMove(component.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${definition.label} up`}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(component.id, 1)}
                    disabled={index === components.length - 1}
                    aria-label={`Move ${definition.label} down`}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(component.id)}
                    aria-label={`Remove ${definition.label}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DiscussionFields({
  value,
  sourceRepo,
  initialSetup,
  setupEndpoint,
  onChange,
}: {
  value: BlockProps<"githubDiscussions">;
  sourceRepo: string;
  initialSetup: DiscussionSetup | null;
  setupEndpoint: string;
  onChange: (patch: Partial<BlockProps<"githubDiscussions">>) => void;
}) {
  const [setup, setSetup] = useState(initialSetup);
  const [setupState, setSetupState] = useState<"idle" | "loading" | "error">("idle");
  const [setupError, setSetupError] = useState<string | null>(null);
  const issues = getGitHubDiscussionsConfigIssues(value);
  const issueFor = (field: keyof BlockProps<"githubDiscussions">) =>
    issues.find((issue) => issue.field === field)?.message;
  const repoPath = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repo)
    ? value.repo.split("/").map(encodeURIComponent).join("/")
    : sourceRepo.split("/").map(encodeURIComponent).join("/");
  const usesManagedRepo =
    Boolean(setup) && value.repo.toLowerCase() === setup?.repo.toLowerCase();
  const isReady =
    issues.length === 0 && (!usesManagedRepo || Boolean(setup?.enabled && !setup.private));

  const applySetup = useCallback(
    (next: DiscussionSetup) => {
      const category =
        next.categories.find((candidate) => candidate.id === value.categoryId) ??
        next.categories.find((candidate) => candidate.name === "Announcements") ??
        next.categories[0];
      onChange({
        repo: next.repo,
        repoId: next.repoId,
        category: category?.name ?? value.category,
        categoryId: category?.id ?? value.categoryId,
      });
    },
    [onChange, value.category, value.categoryId],
  );

  const syncSetup = useCallback(
    async (enable: boolean) => {
      setSetupState("loading");
      setSetupError(null);
      try {
        const response = await fetch(setupEndpoint, { method: enable ? "POST" : "GET" });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isDiscussionSetup(body)) {
          const error =
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : undefined;
          throw new Error(error);
        }
        setSetup(body);
        applySetup(body);
        setSetupState("idle");
      } catch (error) {
        setSetupState("error");
        setSetupError(
          error instanceof Error && error.message
            ? error.message
            : "Could not update the repository settings.",
        );
      }
    },
    [applySetup, setupEndpoint],
  );

  const selectCategory = (categoryId: string) => {
    const category = setup?.categories.find((candidate) => candidate.id === categoryId);
    if (category) onChange({ category: category.name, categoryId: category.id });
  };

  return (
    <div className="pw-discussionform">
      <div className="pw-discussionform__intro">
        <MessageSquare size={20} aria-hidden="true" />
        <div>
          <strong>Add comments to this post</strong>
          <p>
            Pagewright uses this site&apos;s GitHub repository for public comments. Readers only sign
            in with GitHub when they want to comment or react.
          </p>
        </div>
      </div>

      <div className="pw-discussionform__managed">
        <div className="pw-discussionform__repository">
          <span>Comments repository</span>
          <code>{setup?.repo ?? value.repo ?? sourceRepo}</code>
          <small>Managed by Pagewright</small>
        </div>

        {!setup ? (
          <div className="pw-discussionform__notice">
            <div>
              <strong>Setup details are not loaded</strong>
              <span>Refresh to let Pagewright read this repository&apos;s Discussion settings.</span>
            </div>
          </div>
        ) : setup.private ? (
          <div className="pw-discussionform__notice is-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>Giscus requires a public repository. Make this site public before adding comments.</span>
          </div>
        ) : !setup.enabled ? (
          <div className="pw-discussionform__notice">
            <div>
              <strong>GitHub Discussions needs to be enabled</strong>
              <span>Pagewright can update this repository setting for you.</span>
            </div>
            <button
              type="button"
              onClick={() => void syncSetup(true)}
              disabled={setupState === "loading" || !setup}
            >
              {setupState === "loading" ? (
                <Loader2 size={15} className="pw-spin" aria-hidden="true" />
              ) : (
                <MessageSquare size={15} aria-hidden="true" />
              )}
              Enable Discussions
            </button>
          </div>
        ) : (
          <FormField
            label="Discussion category"
            htmlFor="discussion-category-select"
            helper="New conversations for posts will be created in this GitHub category."
            error={issueFor("category")}
          >
            <select
              id="discussion-category-select"
              value={value.categoryId}
              onChange={(event) => selectCategory(event.target.value)}
              disabled={setup.categories.length === 0}
            >
              {setup.categories.length === 0 ? (
                <option value="">No categories available</option>
              ) : (
                setup.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))
              )}
            </select>
          </FormField>
        )}
      </div>

      {setupError ? (
        <div className="pw-discussionform__notice is-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{setupError}</span>
        </div>
      ) : null}

      <div className="pw-discussionform__actions">
        <a href="https://github.com/apps/giscus" target="_blank" rel="noreferrer">
          Connect Giscus
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => void syncSetup(false)}
          disabled={setupState === "loading"}
        >
          <RotateCw size={14} className={setupState === "loading" ? "pw-spin" : undefined} aria-hidden="true" />
          Refresh setup
        </button>
        <a href={`https://github.com/${repoPath}/settings`} target="_blank" rel="noreferrer">
          Repository settings
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      <div
        className={`pw-discussionform__status${isReady ? " is-ready" : ""}`}
        role="status"
      >
        {isReady ? (
          <>
            <Check size={16} aria-hidden="true" />
            <span>Ready. Save the post to publish comments.</span>
          </>
        ) : (
          <>
            <AlertCircle size={16} aria-hidden="true" />
            <span>Finish the setup above before publishing comments.</span>
          </>
        )}
      </div>

      <details className="pw-discussionform__advanced">
        <summary>Advanced settings</summary>
        <p>
          Pagewright fills these values automatically. Change them only when using a different public
          repository or a custom discussion mapping.
        </p>
        <div className="pw-discussionform__grid">
          <FormField label="Repository" htmlFor="discussion-repo" error={issueFor("repo")}>
            <input
              id="discussion-repo"
              value={value.repo}
              onChange={(event) => onChange({ repo: event.target.value })}
              placeholder="owner/repository"
              autoComplete="off"
              aria-invalid={Boolean(issueFor("repo"))}
            />
          </FormField>
          <FormField label="Repository ID" htmlFor="discussion-repo-id" error={issueFor("repoId")}>
            <input
              id="discussion-repo-id"
              value={value.repoId}
              onChange={(event) => onChange({ repoId: event.target.value })}
              placeholder="R_..."
              autoComplete="off"
              aria-invalid={Boolean(issueFor("repoId"))}
            />
          </FormField>
          <FormField label="Category" htmlFor="discussion-category" error={issueFor("category")}>
            <input
              id="discussion-category"
              value={value.category}
              onChange={(event) => onChange({ category: event.target.value })}
              placeholder="Announcements"
              autoComplete="off"
              aria-invalid={Boolean(issueFor("category"))}
            />
          </FormField>
          <FormField label="Category ID" htmlFor="discussion-category-id" error={issueFor("categoryId")}>
            <input
              id="discussion-category-id"
              value={value.categoryId}
              onChange={(event) => onChange({ categoryId: event.target.value })}
              placeholder="DIC_..."
              autoComplete="off"
              aria-invalid={Boolean(issueFor("categoryId"))}
            />
          </FormField>
          <FormField
            label="Post mapping"
            htmlFor="discussion-mapping"
            helper="Pathname keeps each post mapped to the same discussion when its title changes."
          >
            <select
              id="discussion-mapping"
              value={value.mapping}
              onChange={(event) =>
                onChange({
                  mapping: event.target.value as BlockProps<"githubDiscussions">["mapping"],
                })
              }
            >
              <option value="pathname">Post pathname (recommended)</option>
              <option value="url">Full URL</option>
              <option value="title">Post title</option>
              <option value="og:title">Open Graph title</option>
              <option value="specific">Specific term</option>
              <option value="number">Discussion number</option>
            </select>
          </FormField>
          {value.mapping === "specific" ? (
            <FormField label="Specific term" htmlFor="discussion-term" error={issueFor("term")}>
              <input
                id="discussion-term"
                value={value.term ?? ""}
                onChange={(event) => onChange({ term: event.target.value })}
                placeholder="post:stable-key"
                aria-invalid={Boolean(issueFor("term"))}
              />
            </FormField>
          ) : null}
          {value.mapping === "number" ? (
            <FormField
              label="Discussion number"
              htmlFor="discussion-number"
              error={issueFor("discussionNumber")}
            >
              <input
                id="discussion-number"
                type="number"
                min={1}
                value={value.discussionNumber ?? ""}
                aria-invalid={Boolean(issueFor("discussionNumber"))}
                onChange={(event) =>
                  onChange({
                    discussionNumber: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </FormField>
          ) : null}
          <FormField label="Comment box position" htmlFor="discussion-input-position">
            <select
              id="discussion-input-position"
              value={value.inputPosition}
              onChange={(event) =>
                onChange({
                  inputPosition: event.target
                    .value as BlockProps<"githubDiscussions">["inputPosition"],
                })
              }
            >
              <option value="top">Above comments</option>
              <option value="bottom">Below comments</option>
            </select>
          </FormField>
          <FormField label="Giscus theme" htmlFor="discussion-theme">
            <select
              id="discussion-theme"
              value={value.theme}
              onChange={(event) =>
                onChange({
                  theme: event.target.value as BlockProps<"githubDiscussions">["theme"],
                })
              }
            >
              <option value="preferred_color_scheme">Match reader system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="dark_dimmed">Dimmed dark</option>
            </select>
          </FormField>
        </div>

        <div className="pw-discussionform__checks">
          <label>
          <input
            type="checkbox"
            checked={value.reactionsEnabled}
            onChange={(event) => onChange({ reactionsEnabled: event.target.checked })}
          />
          Enable reactions on the post
          </label>
          <label>
          <input
            type="checkbox"
            checked={value.strict}
            onChange={(event) => onChange({ strict: event.target.checked })}
          />
          Use strict discussion matching
          </label>
        </div>
      </details>
    </div>
  );
}

function isDiscussionSetup(value: unknown): value is DiscussionSetup {
  return (
    typeof value === "object" &&
    value !== null &&
    "repo" in value &&
    typeof value.repo === "string" &&
    "repoId" in value &&
    typeof value.repoId === "string" &&
    "enabled" in value &&
    typeof value.enabled === "boolean" &&
    "private" in value &&
    typeof value.private === "boolean" &&
    "categories" in value &&
    Array.isArray(value.categories)
  );
}

function FormField({
  label,
  htmlFor,
  helper,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`pw-discussionform__field${error ? " has-error" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {helper ? <span className="pw-discussionform__helper">{helper}</span> : null}
      {error ? (
        <span className="pw-discussionform__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function PostComponentsPreview({
  components,
  mediaPreviewEndpoint,
  site,
  supportsGlobalFeatures,
}: {
  components: PostComponent[];
  mediaPreviewEndpoint: string;
  site: SiteConfig;
  supportsGlobalFeatures: boolean;
}) {
  if (components.length === 0) {
    return <div className="pw-composer__previewempty">Add a component to preview your post.</div>;
  }

  const bindings = createSiteBindings(site);
  const renderPreviewMarkdown = (markdown: string) => {
    const html = renderMarkdown(markdown);
    return supportsGlobalFeatures ? resolveHtmlBindingString(html, bindings) : html;
  };

  return (
    <div className="pw-postpreview">
      {components.map((component) =>
        component.type === "prose" ? (
          component.props.markdown?.trim() ? (
            <article
              key={component.id}
              className="pw-prose pw-postpreview__prose"
              dangerouslySetInnerHTML={{
                __html: rewriteMediaPreviewSources(
                  renderPreviewMarkdown(component.props.markdown),
                  mediaPreviewEndpoint,
                ),
              }}
            />
          ) : (
            <div key={component.id} className="pw-postpreview__emptycomponent">
              Empty text component
            </div>
          )
        ) : (
          <DiscussionPreview key={component.id} value={component.props} />
        ),
      )}
    </div>
  );
}

function DiscussionPreview({ value }: { value: BlockProps<"githubDiscussions"> }) {
  const issues = getGitHubDiscussionsConfigIssues(value);
  return (
    <section className="pw-discussion pw-postpreview__discussion" aria-label="Discussion preview">
      <div className="pw-discussion__header">
        <div>
          <h2 className="pw-discussion__heading">Discussion</h2>
          <p className="pw-discussion__intro">
            Read publicly. Sign in with GitHub in the comments panel to join the conversation.
          </p>
        </div>
        <span className="pw-discussion__github">Sign in with GitHub</span>
      </div>
      {issues.length > 0 ? (
        <div className="pw-discussion__setup">
          <strong>Comments are not configured yet.</strong>
          <p>{issues[0]!.message}</p>
        </div>
      ) : (
        <div className="pw-postpreview__giscus">
          <MessageSquare size={20} aria-hidden="true" />
          <strong>Giscus comments load here</strong>
          <span>The live post creates or finds its discussion using {value.mapping} mapping.</span>
        </div>
      )}
    </section>
  );
}
