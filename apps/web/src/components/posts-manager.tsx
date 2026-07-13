"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { PostStatus } from "@/lib/content/posts";

export interface PostListItem {
  slug: string;
  path: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  status: PostStatus;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Client controller for the Posts view: create (title → starter draft → open editor), edit (deep
 * link into the visual builder), and delete (with confirm). Mutations hit the posts API then
 * `router.refresh()` so the server list re-renders with fresh data and head SHA.
 */
export function PostsManager({
  owner,
  repo,
  initialPosts,
  headSha,
  liveUrl,
}: {
  owner: string;
  repo: string;
  initialPosts: PostListItem[];
  headSha: string | null;
  liveUrl: string | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const editHref = (post: PostListItem) =>
    `/sites/${owner}/${repo}/edit?path=${encodeURIComponent(post.path)}`;

  return (
    <>
      <div className="pw-dash__head">
        <div>
          <h1 className="pw-dash__title">Posts</h1>
          <p className="pw-dash__subtitle">
            Write and manage the blog posts for <strong>{repo}</strong>. Publishing commits to your
            repo and redeploys automatically.
          </p>
        </div>
        <button
          type="button"
          className="pw-btn pw-btn--primary"
          onClick={() => setCreating(true)}
          disabled={pending}
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          <span>New post</span>
        </button>
      </div>

      {initialPosts.length === 0 ? (
        <div className="pw-empty">
          <div className="pw-empty__icon" aria-hidden="true">
            <FileText size={26} strokeWidth={2} />
          </div>
          <h2 className="pw-empty__title">No posts yet</h2>
          <p className="pw-empty__body">
            Create your first post. Pagewright adds it to your repo as a draft and opens the visual
            editor so you can write, then publish when you’re ready.
          </p>
          <button type="button" className="pw-btn pw-btn--primary" onClick={() => setCreating(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            <span>Write your first post</span>
          </button>
        </div>
      ) : (
        <ul className="pw-postlist">
          {initialPosts.map((post) => (
            <PostRow
              key={post.path}
              post={post}
              owner={owner}
              repo={repo}
              headSha={headSha}
              editHref={editHref(post)}
              liveUrl={liveUrl}
              onChanged={() => startTransition(() => router.refresh())}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <NewPostDialog
          owner={owner}
          repo={repo}
          onClose={() => setCreating(false)}
          onCreated={(path) => {
            router.push(`/sites/${owner}/${repo}/edit?path=${encodeURIComponent(path)}`);
          }}
        />
      ) : null}
    </>
  );
}

function PostRow({
  post,
  owner,
  repo,
  headSha,
  editHref,
  liveUrl,
  onChanged,
}: {
  post: PostListItem;
  owner: string;
  repo: string;
  headSha: string | null;
  editHref: string;
  liveUrl: string | null;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${owner}/${repo}/posts`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: post.path, expectedHeadSha: headSha ?? undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Couldn’t delete this post.");
        setBusy(false);
        return;
      }
      setConfirming(false);
      onChanged();
    } catch {
      setError("Network error while deleting.");
      setBusy(false);
    }
  }, [owner, repo, post.path, headSha, onChanged]);

  const publishedLiveHref =
    liveUrl && post.status.tone === "published"
      ? `${liveUrl.replace(/\/$/, "")}/blog/${post.slug}/`
      : null;

  return (
    <li className="pw-postrow">
      <div className="pw-postrow__main">
        <div className="pw-postrow__top">
          <span className={`pw-status pw-status--${post.status.tone}`}>
            {post.status.tone === "scheduled" ? (
              <CalendarClock size={13} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <span className="pw-status__dot" aria-hidden="true" />
            )}
            {post.status.label}
          </span>
          {post.date ? <span className="pw-postrow__date">{formatDate(post.date)}</span> : null}
          {post.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="pw-chip">
              {tag}
            </span>
          ))}
        </div>
        <Link href={editHref} className="pw-postrow__title">
          {post.title || post.slug}
        </Link>
        {post.excerpt ? <p className="pw-postrow__excerpt">{post.excerpt}</p> : null}
        {error ? <p className="pw-field__error">{error}</p> : null}
      </div>

      <div className="pw-postrow__actions">
        {publishedLiveHref ? (
          <a className="pw-linkpill" href={publishedLiveHref} target="_blank" rel="noreferrer">
            <ExternalLink size={13} aria-hidden="true" />
            <span>View</span>
          </a>
        ) : null}
        <Link href={editHref} className="pw-btn pw-btn--ghost pw-btn--sm">
          <Pencil size={14} aria-hidden="true" />
          <span>Edit</span>
        </Link>
        {confirming ? (
          <span className="pw-postrow__confirm">
            <button
              type="button"
              className="pw-btn pw-btn--danger pw-btn--sm"
              onClick={onDelete}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={14} className="pw-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              <span>Confirm</span>
            </button>
            <button
              type="button"
              className="pw-btn pw-btn--ghost pw-btn--sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="pw-btn pw-btn--ghost pw-btn--sm pw-btn--icononly"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${post.title || post.slug}`}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

function NewPostDialog({
  owner,
  repo,
  onClose,
  onCreated,
}: {
  owner: string;
  repo: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give your post a title to get started.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${owner}/${repo}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as
        | { path?: string; error?: string }
        | null;
      if (!res.ok || !body?.path) {
        setError(body?.error ?? "Couldn’t create the post.");
        setBusy(false);
        return;
      }
      onCreated(body.path);
    } catch {
      setError("Network error while creating the post.");
      setBusy(false);
    }
  }, [title, owner, repo, onCreated]);

  return (
    <div
      className="pw-modal"
      role="dialog"
      aria-modal="true"
      aria-label="New post"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="pw-modal__card">
        <div className="pw-modal__head">
          <h2 className="pw-modal__title">New post</h2>
          <button
            type="button"
            className="pw-postmeta__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <label className="pw-field">
          <span className="pw-field__label">Title</span>
          <input
            ref={inputRef}
            type="text"
            className="pw-input"
            value={title}
            autoFocus
            placeholder="e.g. Ten lessons from my first year blogging"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) submit();
            }}
          />
          <span className="pw-field__hint">
            We’ll create a draft and open the editor. You can change everything later.
          </span>
        </label>
        {error ? <p className="pw-field__error">{error}</p> : null}
        <div className="pw-modal__actions">
          <button type="button" className="pw-btn pw-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pw-btn pw-btn--primary" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={15} className="pw-spin" aria-hidden="true" />
                <span>Creating…</span>
              </>
            ) : (
              <>
                <Plus size={15} aria-hidden="true" />
                <span>Create &amp; edit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
