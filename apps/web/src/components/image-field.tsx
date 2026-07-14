"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { MEDIA_UPLOAD_ACCEPT, useMediaUpload } from "@/lib/builder/media-context";

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
  const labelId = useId();
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewUrl = uploader?.previewUrl?.(value) ?? value;

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || busy) return;
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
    [busy, uploader, onChange],
  );

  return (
    <div className="pw-imgfield">
      {label ? (
        <span id={labelId} className="pw-imgfield__label">
          {label}
        </span>
      ) : null}
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
      >
        <button
          type="button"
          className="pw-imgfield__trigger"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-busy={busy}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pw-imgfield__preview" src={previewUrl} alt="" />
          ) : (
            <span className="pw-imgfield__placeholder">
              <ImagePlus size={18} aria-hidden="true" />
            </span>
          )}
          <span className="pw-imgfield__hint" aria-live="polite">
            {busy ? (
              <>
                <Loader2 size={14} className="pw-spin" aria-hidden="true" /> Uploading...
              </>
            ) : (
              <>
                <Upload size={14} aria-hidden="true" /> Drop an image or choose a file
              </>
            )}
          </span>
        </button>
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
        accept={MEDIA_UPLOAD_ACCEPT}
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        type="text"
        className="pw-imgfield__url"
        aria-label={`${label ?? "Image"} URL`}
        placeholder="Paste an image URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span id={errorId} className="pw-imgfield__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
