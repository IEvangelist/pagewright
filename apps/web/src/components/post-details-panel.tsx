"use client";

import { useCallback, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { MEDIA_UPLOAD_ACCEPT, type MediaUploader } from "@/lib/builder/media-context";
import type { PostMeta } from "@/lib/content/posts";

/** Read a File as a bare base64 string (no data-URL prefix). Browser-only (uses FileReader). */
export function fileToBase64(file: File): Promise<string> {
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
export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** A datetime-local input value → a normalized ISO string (or "" when empty/invalid). */
export function fromLocalInput(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * The blog front-matter editor: draft toggle, publish date, schedule, author, excerpt, tags and a
 * cover-image uploader. Shared by both the visual page editor and the markdown post composer so post
 * metadata behaves identically wherever a post is edited.
 */
export function PostDetailsPanel({
  meta,
  onChange,
  onClose,
  uploader,
  variant = "card",
}: {
  meta: PostMeta;
  onChange: (patch: Partial<PostMeta>) => void;
  onClose: () => void;
  uploader: MediaUploader;
  variant?: "card" | "panel";
}) {
  const [tagsInput, setTagsInput] = useState(meta.tags.join(", "));
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverPreview = uploader.previewUrl?.(meta.cover) ?? meta.cover;

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
    <div
      className={`pw-postmeta${variant === "panel" ? " pw-postmeta--panel" : ""}`}
      role="group"
      aria-label="Post details"
    >
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
        <label className="pw-field pw-field--check pw-field--wide">
          <input
            type="checkbox"
            checked={meta.draft}
            onChange={(e) => onChange({ draft: e.target.checked })}
          />
          <span>
            <strong>Draft</strong>: keep hidden from the published site
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

        <label className="pw-field pw-field--wide">
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
              <img className="pw-postmeta__coverimg" src={coverPreview} alt="" />
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
                  accept={MEDIA_UPLOAD_ACCEPT}
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
