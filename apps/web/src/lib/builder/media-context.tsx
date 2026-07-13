"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface UploadedMedia {
  /** Site-relative URL the deployed Astro site serves the asset from (e.g. `/media/logo.png`). */
  url: string;
  /** Repo path the asset was committed to (e.g. `public/media/logo.png`). */
  path: string;
}

export interface MediaUploader {
  upload: (file: File) => Promise<UploadedMedia>;
}

const MediaUploadContext = createContext<MediaUploader | null>(null);

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
