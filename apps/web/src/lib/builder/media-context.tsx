"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface UploadedMedia {
  /** Site-relative URL the deployed Astro site serves the asset from (e.g. `/media/logo.png`). */
  url: string;
  /** Repo path the asset was committed to (e.g. `public/media/logo.png`). */
  path: string;
}

export interface MediaUploader {
  /**
   * Commits a file and applies its URL while the upload is still considered pending. Keeping both
   * steps in one boundary prevents a save from capturing the document before the URL is attached.
   */
  upload: (file: File, apply: (media: UploadedMedia) => void) => Promise<void>;
  previewUrl?: (value: string) => string;
}

export const MEDIA_UPLOAD_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,image/avif,image/x-icon,image/vnd.microsoft.icon";

const MediaUploadContext = createContext<MediaUploader | null>(null);

export function resolveMediaPreviewUrl(
  value: string | undefined,
  mediaPreviewEndpoint?: string,
): string | undefined {
  if (!value?.startsWith("/media/") || !mediaPreviewEndpoint) return value;
  return `${mediaPreviewEndpoint}?path=${encodeURIComponent(`public${value}`)}`;
}

/**
 * Makes an uploader available to Puck's custom image fields, which render deep inside the editor
 * tree and can't otherwise reach the owner/repo context needed to commit media to the right repo.
 */
export function MediaUploadProvider({
  uploader,
  children,
}: {
  uploader: MediaUploader;
  children: ReactNode;
}) {
  return (
    <MediaUploadContext.Provider value={uploader}>{children}</MediaUploadContext.Provider>
  );
}

export function useMediaUpload(): MediaUploader | null {
  return useContext(MediaUploadContext);
}
