"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { useMediaUpload } from "@/lib/builder/media-context";

/**
 * A Puck custom-field renderer for image props. Supports drag-and-drop or click-to-browse; the
 * dropped file is committed to the site repo's media folder via the injected {@link useMediaUpload}
 * uploader, and the resulting site-relative URL is written back into the block prop. Falls back to a
 * plain URL text input so pasting an external URL still works.
 */
export function ImageField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const uploader = useMediaUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!uploader) {
        setError("Uploads aren’t available here.");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await uploader.upload(file);
        onChange(result.url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [uploader, onChange],
  );

  return (
    <div className="pw-imgfield">
      {label ? <span className="pw-imgfield__label">{label}</span> : null}
      <div
        className={`pw-imgfield__drop${dragging ? " pw-imgfield__drop--drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pw-imgfield__preview" src={value} alt="" />
        ) : (
          <span className="pw-imgfield__placeholder">
            <ImagePlus size={18} aria-hidden="true" />
          </span>
        )}
        <span className="pw-imgfield__hint">
          {busy ? (
            <>
              <Loader2 size={14} className="pw-spin" aria-hidden="true" /> Uploading…
            </>
          ) : (
            <>
              <Upload size={14} aria-hidden="true" /> Drop an image or click to upload
            </>
          )}
        </span>
        {value ? (
          <button
            type="button"
            className="pw-imgfield__clear"
            aria-label="Remove image"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setError(null);
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        type="text"
        className="pw-imgfield__url"
        placeholder="…or paste an image URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className="pw-imgfield__error">{error}</span> : null}
    </div>
  );
}
