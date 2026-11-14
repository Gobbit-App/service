import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmMediaAsset, reportUploadFailure } from '../api/media';
import type { MediaAsset } from '@gobbit/shared';
import { signAndUpload, UploadError } from './upload';
import {
  failure,
  sendFailureReport,
  useKindSigners,
  type UseImageUploadOptions,
} from './use-image-upload';

/** One photo on its way into a gallery; it leaves the list once confirmed (or removed). */
export type PendingPhoto = {
  id: number;
  file: File;
  /** A local thumbnail while it uploads (revoked when the entry leaves). */
  localUrl: string;
} & (
  | { status: 'uploading'; percent: number | null }
  | { status: 'confirming' }
  | { status: 'failed'; message: string; canRetry: boolean }
);

export type UseGalleryUploadsOptions = Omit<UseImageUploadOptions, 'onUploaded'> & {
  /** Called once per confirmed photo, in the order they finish. */
  onUploaded: (asset: MediaAsset) => void;
};

/**
 * D398: several photo uploads at once for the gallery editor. Each picked photo uploads on its
 * own (progress, cancel, retry with the same file); a photo joins the gallery only after the API
 * confirms it (D157), so a failed or cancelled one never reaches the card (FR-005).
 */
export function useGalleryUploads({
  deckId,
  onUploaded,
  signer: injectedSigner,
  upload = signAndUpload,
  confirm = confirmMediaAsset,
  report = reportUploadFailure,
}: UseGalleryUploadsOptions) {
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const signerFor = useKindSigners(deckId, injectedSigner);
  const controllers = useRef(new Map<number, AbortController>());
  const nextId = useRef(1);
  const latestOnUploaded = useRef(onUploaded);

  useEffect(() => {
    latestOnUploaded.current = onUploaded;
  }, [onUploaded]);

  // Thumbnails still showing when the editor goes away are freed with it.
  const shown = useRef<PendingPhoto[]>([]);
  useEffect(() => {
    shown.current = pending;
  }, [pending]);

  useEffect(() => {
    const running = controllers.current;
    const thumbnails = shown;
    return () => {
      for (const controller of running.values()) controller.abort();
      running.clear();
      for (const entry of thumbnails.current) URL.revokeObjectURL(entry.localUrl);
    };
  }, []);

  const patch = useCallback((id: number, next: Partial<PendingPhoto>) => {
    setPending((list) =>
      list.map((entry) => (entry.id === id ? ({ ...entry, ...next } as PendingPhoto) : entry)),
    );
  }, []);

  const drop = useCallback((id: number) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setPending((list) => {
      const gone = list.find((entry) => entry.id === id);
      if (gone) URL.revokeObjectURL(gone.localUrl);
      return list.filter((entry) => entry.id !== id);
    });
  }, []);

  const run = useCallback(
    async (id: number, file: File) => {
      controllers.current.get(id)?.abort();
      const attempt = new AbortController();
      controllers.current.set(id, attempt);
      patch(id, { status: 'uploading', percent: null });
      try {
        const uploaded = await upload(file, signerFor('image'), {
          signal: attempt.signal,
          onProgress: (percent) => {
            if (!attempt.signal.aborted) patch(id, { status: 'uploading', percent });
          },
        });
        if (attempt.signal.aborted) return;
        patch(id, { status: 'confirming' });
        const asset = await confirm(deckId, uploaded);
        if (attempt.signal.aborted) return;
        controllers.current.delete(id);
        latestOnUploaded.current(asset);
        drop(id);
      } catch (error) {
        if (controllers.current.get(id) !== attempt) return;
        controllers.current.delete(id);
        if (error instanceof UploadError && error.reason === 'aborted') return;
        patch(id, { status: 'failed', ...failure(error) });
        sendFailureReport(error, file, deckId, report);
      }
    },
    [confirm, deckId, drop, patch, report, signerFor, upload],
  );

  return {
    pending,
    busy: pending.some((entry) => entry.status !== 'failed'),
    /** Starts uploading each file (call from the event handler that picked them). */
    add: (files: File[]) => {
      const added = files.map((file): PendingPhoto => ({
        id: nextId.current++,
        file,
        localUrl: URL.createObjectURL(file),
        status: 'uploading',
        percent: null,
      }));
      setPending((list) => [...list, ...added]);
      for (const entry of added) void run(entry.id, entry.file);
    },
    retry: (id: number) => {
      const entry = pending.find((p) => p.id === id);
      if (entry) void run(id, entry.file);
    },
    /** Cancels an upload or forgets a failed one; nothing reaches the card. */
    remove: drop,
  };
}
