"use client";

import "@measured/puck/puck.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  createUsePuck,
  Puck,
  useGetPuck,
  type Data,
  type Overrides,
} from "@measured/puck";
import type { SiteConfig } from "@pagewright/blocks";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCw,
  Settings2,
  Undo2,
} from "lucide-react";
import { puckConfig } from "@/lib/builder/puck-config";
import {
  MediaUploadProvider,
  resolveMediaPreviewUrl,
  type MediaUploader,
} from "@/lib/builder/media-context";
import { SiteBindingsProvider } from "@/lib/builder/site-bindings-context";
import type { PostMeta } from "@/lib/content/posts";
import { PostDetailsPanel, fileToBase64 } from "@/components/post-details-panel";

const DRAFT_PREFIX = "pagewright:page-draft:";
const DRAFT_DEBOUNCE_MS = 600;
const COMPACT_EDITOR_QUERY = "(max-width: 900px)";
const useEditorPuck = createUsePuck();

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

/**
 * Visual page/post editor. Wraps Puck with the Pagewright block config so editing is fully WYSIWYG
 * against the real block components. Every change is autosaved to localStorage (so a reload or crash
 * never loses work); the explicit "Publish" action commits the document back to the repo, which
 * pushes to `main`, triggers the deploy workflow, and clears the local draft.
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
  site,
  supportsGlobalFeatures,
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
  site: SiteConfig;
  supportsGlobalFeatures: boolean;
  initialData: Data;
  initialHeadSha: string | null;
  postMeta?: PostMeta;
}) {
  const isPost = postMeta !== undefined;
  const resolvedBackHref = backHref ?? `/sites/${owner}/${repo}`;
  const draftKey = `${DRAFT_PREFIX}${owner}/${repo}:${path}`;
  const metaDraftKey = `${draftKey}:meta`;

  const [restoredDraft, setRestoredDraft] = useState(false);
  const [editorData, setEditorData] = useState<Data | null>(null);
  const [compactLayout, setCompactLayout] = useState(false);
  const [meta, setMeta] = useState<PostMeta | undefined>(postMeta);
  const metaRef = useRef<PostMeta | undefined>(meta);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingDraftRef = useRef<Data | null>(null);
  // The branch head the editor is working against. Sent with every save for conflict detection and
  // advanced to the new commit after each successful save so consecutive saves don't false-conflict.
  const headShaRef = useRef<string | null>(initialHeadSha);
  // The most recent editor data, kept so a conflict "overwrite" can re-submit what the user has.
  const lastDataRef = useRef<Data>(initialData);

  useEffect(() => {
    let nextData = initialData;
    let nextMeta = postMeta;
    let restored = false;
    let restoreFailed = false;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        nextData = JSON.parse(raw) as Data;
        restored = true;
      }
    } catch {
      restoreFailed = true;
    }

    if (postMeta) {
      try {
        const raw = window.localStorage.getItem(metaDraftKey);
        if (raw) {
          nextMeta = { ...postMeta, ...(JSON.parse(raw) as Partial<PostMeta>) };
          restored = true;
        }
      } catch {
        restoreFailed = true;
      }
    }

    lastDataRef.current = nextData;
    metaRef.current = nextMeta;
    setMeta(nextMeta);
    setRestoredDraft(restored);
    setCompactLayout(window.matchMedia(COMPACT_EDITOR_QUERY).matches);
    setEditorData(nextData);
    if (restoreFailed) {
      setSaveState("error");
      setMessage("Local backup couldn’t be restored. The latest GitHub version is open.");
    }
  }, [draftKey, initialData, metaDraftKey, postMeta]);

  const writeDraft = useCallback(
    (next: Data, surfaceError: boolean) => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(next));
        if (pendingDraftRef.current === next) pendingDraftRef.current = null;
      } catch (error) {
        if (surfaceError) {
          setSaveState("error");
          setMessage("Local backup is unavailable. Publish before leaving this page.");
        } else {
          console.error("[pagewright] Failed to flush the local page draft.", error);
        }
      }
    },
    [draftKey],
  );

  const flushDraft = useCallback(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = undefined;
    }
    if (pendingDraftRef.current) writeDraft(pendingDraftRef.current, false);
  }, [writeDraft]);

  useEffect(() => {
    window.addEventListener("pagehide", flushDraft);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      flushDraft();
    };
  }, [flushDraft]);

  const onChange = useCallback(
    (next: Data) => {
      lastDataRef.current = next;
      pendingDraftRef.current = next;
      setSaveState((state) => (state === "saved" || state === "error" ? "idle" : state));
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = undefined;
        writeDraft(next, true);
      }, DRAFT_DEBOUNCE_MS);
    },
    [writeDraft],
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
          setSaveState("error");
          setMessage("Local backup is unavailable. Publish before leaving this page.");
        }
        return next;
      });
      setSaveState((state) => (state === "saved" ? "idle" : state));
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
          setMessage(body?.error ?? "This site changed in GitHub while you were editing.");
          return;
        }
        if (!res.ok) {
          setSaveState("error");
          setMessage(body?.error ?? "Couldn’t save your changes.");
          return;
        }
        if (body?.headSha) headShaRef.current = body.headSha;
        if (draftTimer.current) {
          clearTimeout(draftTimer.current);
          draftTimer.current = undefined;
        }
        pendingDraftRef.current = null;
        let localBackupCleared = true;
        try {
          window.localStorage.removeItem(draftKey);
          window.localStorage.removeItem(metaDraftKey);
        } catch (error) {
          localBackupCleared = false;
          console.error("[pagewright] Failed to clear the published local draft.", error);
        }
        setRestoredDraft(false);
        setSaveState("saved");
        const successMessage =
          isPost && metaRef.current?.draft
            ? "Saved as draft. It stays hidden until you publish it."
            : "Published. Your site is deploying now.";
        setMessage(
          localBackupCleared
            ? successMessage
            : `${successMessage} Clear this site’s browser data before editing again.`,
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
    const confirmed = window.confirm(
      "Discard your local edits and load the latest version from GitHub? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(metaDraftKey);
    } catch {
      setSaveState("error");
      setMessage("The local draft couldn’t be cleared. Your edits were not discarded.");
      return;
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    pendingDraftRef.current = null;
    window.location.reload();
  }, [draftKey, metaDraftKey]);

  // Uploads a dropped/selected image to the repo's media folder and hands back the site-relative URL
  // the block should reference. Memoized so the provider value is stable across renders.
  const mediaPreviewEndpoint = `/api/sites/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/media`;
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
            expectedHeadSha: headShaRef.current ?? undefined,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | { url?: string; path?: string; headSha?: string; error?: string; code?: string }
          | null;
        if (res.status === 409 || body?.code === "conflict") {
          setSaveState("conflict");
          setMessage(body?.error ?? "This site changed in GitHub while you were editing.");
          throw new Error(body?.error ?? "Resolve the GitHub conflict before uploading.");
        }
        if (!res.ok || !body?.url) {
          throw new Error(body?.error ?? "Upload failed.");
        }
        if (body.headSha) headShaRef.current = body.headSha;
        return { url: body.url, path: body.path ?? "" };
      },
      previewUrl(value) {
        return resolveMediaPreviewUrl(value, mediaPreviewEndpoint) ?? value;
      },
    }),
    [mediaPreviewEndpoint, owner, repo],
  );

  const editorMetadata = useMemo(
    () => ({ mediaPreviewEndpoint }),
    [mediaPreviewEndpoint],
  );

  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      header: () => (
        <EditorHeader
          title={editingLabel ?? siteName}
          kind={isPost ? "Post" : "Page"}
          backHref={resolvedBackHref}
          backLabel={backLabel}
          liveUrl={liveUrl}
          restoredDraft={restoredDraft}
          saveState={saveState}
          message={message}
          detailsOpen={detailsOpen}
          onToggleDetails={isPost ? () => setDetailsOpen((open) => !open) : undefined}
          onPublish={onPublish}
          onOverwrite={onOverwrite}
          onReload={onReload}
          detailsPanel={
            isPost && detailsOpen && meta ? (
              <PostDetailsPanel
                meta={meta}
                onChange={updateMeta}
                onClose={() => setDetailsOpen(false)}
                uploader={uploader}
              />
            ) : null
          }
        />
      ),
      drawer: EditorDrawer,
      outline: EditorOutline,
    }),
    [
      backLabel,
      detailsOpen,
      editingLabel,
      isPost,
      liveUrl,
      message,
      meta,
      onOverwrite,
      onPublish,
      onReload,
      resolvedBackHref,
      restoredDraft,
      saveState,
      siteName,
      updateMeta,
      uploader,
    ],
  );

  if (!editorData) {
    return (
      <div className="pw-editor pw-editor--loading" role="status" aria-label="Loading editor">
        <div className="pw-editor__loadingbar">
          <span className="pw-editor__loadingline pw-editor__loadingline--title" />
          <span className="pw-editor__loadingline pw-editor__loadingline--actions" />
        </div>
        <div className="pw-editor__loadingbody">
          <span className="pw-editor__loadingpanel" />
          <span className="pw-editor__loadingcanvas" />
          <span className="pw-editor__loadingpanel" />
        </div>
      </div>
    );
  }

  return (
    <div className="pw-editor">
      <div className="pw-editor__canvas">
        <SiteBindingsProvider site={site} supportsGlobalFeatures={supportsGlobalFeatures}>
          <MediaUploadProvider uploader={uploader}>
            <Puck
              config={puckConfig}
              data={editorData}
              metadata={editorMetadata}
              onChange={onChange}
              onPublish={onPublish}
              overrides={overrides}
              ui={{
                leftSideBarVisible: !compactLayout,
                rightSideBarVisible: !compactLayout,
                leftSideBarWidth: 280,
                rightSideBarWidth: 340,
              }}
              iframe={{ enabled: false }}
            />
          </MediaUploadProvider>
        </SiteBindingsProvider>
      </div>
    </div>
  );
}

/** The blog front-matter editor is shared with the markdown composer; see post-details-panel.tsx. */

function EditorHeader({
  title,
  kind,
  backHref,
  backLabel,
  liveUrl,
  restoredDraft,
  saveState,
  message,
  detailsOpen,
  onToggleDetails,
  onPublish,
  onOverwrite,
  onReload,
  detailsPanel,
}: {
  title: string;
  kind: "Page" | "Post";
  backHref: string;
  backLabel: string;
  liveUrl: string | null;
  restoredDraft: boolean;
  saveState: SaveState;
  message: string | null;
  detailsOpen: boolean;
  onToggleDetails?: () => void;
  onPublish: (data: Data) => void;
  onOverwrite: () => void;
  onReload: () => void;
  detailsPanel: ReactNode;
}) {
  const dispatch = useEditorPuck((state) => state.dispatch);
  const leftSideBarVisible = useEditorPuck(
    (state) => state.appState.ui.leftSideBarVisible,
  );
  const rightSideBarVisible = useEditorPuck(
    (state) => state.appState.ui.rightSideBarVisible,
  );
  const undo = useEditorPuck((state) => state.history.back);
  const redo = useEditorPuck((state) => state.history.forward);
  const hasPast = useEditorPuck((state) => state.history.hasPast);
  const hasFuture = useEditorPuck((state) => state.history.hasFuture);
  const getPuck = useGetPuck();
  const publishing = saveState === "saving";
  const blocked = saveState === "conflict";

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_EDITOR_QUERY);
    const resetSidebars = (event: MediaQueryListEvent) => {
      dispatch({
        type: "setUi",
        ui: event.matches
          ? { leftSideBarVisible: false, rightSideBarVisible: false }
          : { leftSideBarVisible: true, rightSideBarVisible: true },
      });
    };
    mediaQuery.addEventListener("change", resetSidebars);
    return () => mediaQuery.removeEventListener("change", resetSidebars);
  }, [dispatch]);

  const toggleSidebar = (side: "left" | "right") => {
    const narrow = window.matchMedia(COMPACT_EDITOR_QUERY).matches;
    if (side === "left") {
      dispatch({
        type: "setUi",
        ui: {
          leftSideBarVisible: !leftSideBarVisible,
          ...(narrow ? { rightSideBarVisible: false } : {}),
        },
      });
      return;
    }
    dispatch({
      type: "setUi",
      ui: {
        rightSideBarVisible: !rightSideBarVisible,
        ...(narrow ? { leftSideBarVisible: false } : {}),
      },
    });
  };

  return (
    <div className="pw-editor__header">
      <header className="pw-editor__toolbar">
        <div className="pw-editor__context">
          <Link
            href={backHref}
            className="pw-editor__back"
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span className="pw-editor__backlabel">{backLabel}</span>
          </Link>
          <span className="pw-editor__divider" aria-hidden="true" />
          <span className="pw-editor__identity">
            <strong className="pw-editor__title" title={title}>
              {title}
            </strong>
            <span className="pw-editor__kind">{kind}</span>
          </span>
        </div>

        <div className="pw-editor__tools">
          <div className="pw-editor__controlgroup" role="group" aria-label="Editor panels">
            <button
              type="button"
              className={`pw-editor__control${leftSideBarVisible ? " is-active" : ""}`}
              onClick={() => toggleSidebar("left")}
              aria-label={leftSideBarVisible ? "Hide page sections" : "Show page sections"}
              title={leftSideBarVisible ? "Hide page sections" : "Show page sections"}
              aria-pressed={leftSideBarVisible}
            >
              <PanelLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`pw-editor__control${rightSideBarVisible ? " is-active" : ""}`}
              onClick={() => toggleSidebar("right")}
              aria-label={rightSideBarVisible ? "Hide section settings" : "Show section settings"}
              title={rightSideBarVisible ? "Hide section settings" : "Show section settings"}
              aria-pressed={rightSideBarVisible}
            >
              <PanelRight size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="pw-editor__controlgroup" role="group" aria-label="Edit history">
            <button
              type="button"
              className="pw-editor__control"
              onClick={undo}
              disabled={!hasPast || publishing}
              aria-label="Undo"
              title="Undo"
            >
              <Undo2 size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pw-editor__control"
              onClick={redo}
              disabled={!hasFuture || publishing}
              aria-label="Redo"
              title="Redo"
            >
              <Redo2 size={17} aria-hidden="true" />
            </button>
          </div>

          {onToggleDetails ? (
            <button
              type="button"
              className={`pw-editor__textcontrol${detailsOpen ? " is-active" : ""}`}
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
            >
              <Settings2 size={16} aria-hidden="true" />
              <span>Post details</span>
            </button>
          ) : null}

          {saveState !== "error" ? (
            <SaveBadge state={saveState} message={message} restoredDraft={restoredDraft} />
          ) : null}

          {liveUrl ? (
            <a
              className="pw-editor__live"
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="View live site in a new tab"
              title="View live site"
            >
              <span>View live</span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : null}

          <button
            type="button"
            className="pw-editor__publish"
            onClick={() => onPublish(getPuck().appState.data)}
            disabled={publishing || blocked}
          >
            {publishing ? (
              <Loader2 size={16} className="pw-spin" aria-hidden="true" />
            ) : (
              <Globe size={16} aria-hidden="true" />
            )}
            <span>{publishing ? "Publishing..." : "Publish"}</span>
          </button>
        </div>
      </header>

      {saveState === "error" ? (
        <div className="pw-editor__error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{message ?? "Something went wrong. Your latest changes were not published."}</span>
        </div>
      ) : null}

      {saveState === "conflict" ? (
        <div className="pw-editor__conflict" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div className="pw-editor__conflictcopy">
            <strong>GitHub has a newer version</strong>
            <span>
              {message ??
                "This site changed since you opened the editor. Choose which version to keep."}
            </span>
          </div>
          <div className="pw-editor__conflictactions">
            <button type="button" className="pw-editor__discard" onClick={onReload}>
              <RotateCw size={15} aria-hidden="true" />
              <span>Discard and reload</span>
            </button>
            <button type="button" className="pw-editor__publish" onClick={onOverwrite}>
              Publish my version
            </button>
          </div>
        </div>
      ) : null}

      {detailsPanel}
    </div>
  );
}

function EditorDrawer({ children }: { children: ReactNode }) {
  return (
    <div className="pw-editor__panelbody">
      <p className="pw-editor__panelintro">Drag a section onto the page.</p>
      {children}
    </div>
  );
}

function EditorOutline({ children }: { children: ReactNode }) {
  return (
    <div className="pw-editor__panelbody">
      <p className="pw-editor__panelintro">Select a section to edit or reorder it.</p>
      {children}
    </div>
  );
}

function SaveBadge({
  state,
  message,
  restoredDraft,
}: {
  state: SaveState;
  message: string | null;
  restoredDraft: boolean;
}) {
  // The conflict case is surfaced by a dedicated banner with actions, not the compact status.
  if ((state === "idle" && !restoredDraft) || state === "conflict") return null;
  const icon =
    state === "idle" ? (
      <RotateCw size={14} aria-hidden="true" />
    ) : state === "saving" ? (
      <Loader2 size={14} className="pw-spin" aria-hidden="true" />
    ) : state === "saved" ? (
      <Check size={14} aria-hidden="true" />
    ) : (
      <AlertCircle size={14} aria-hidden="true" />
    );
  let label = "Publish failed";
  if (restoredDraft && state === "idle") label = "Local draft restored";
  if (state === "saving") label = "Publishing...";
  if (state === "saved") {
    label = message?.startsWith("Saved as draft") ? "Draft saved" : "Published";
  }
  if (state === "error" && message?.startsWith("Local backup")) {
    label = "Backup unavailable";
  }
  const accessibleMessage = message ?? label;
  return (
    <span
      className={`pw-editor__savebadge pw-editor__savebadge--${state}`}
      role="status"
      aria-live="polite"
      aria-label={accessibleMessage}
      title={accessibleMessage}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
