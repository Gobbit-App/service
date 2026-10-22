import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../api/api-error';
import { confirmMediaAsset, reportUploadFailure, signMediaUpload } from '../api/media';
import type { MediaAsset, MediaUploadFailureRequest } from '@pb/shared';
import {
  cachedSigner,
  signAndUpload,
  uploadFailureReport,
  UploadError,
  type Signer,
  type UploadedImage,
} from './upload';

/** idle → signing → uploading(percent) → confirming → idle (done or cancelled) | failed. */
export type ImageUploadState =
  | { status: 'idle' }
  | { status: 'signing' }
  | { status: 'uploading'; percent: number }
  | { status: 'confirming' }
  | { status: 'failed'; message: string; canRetry: boolean };

export type UseImageUploadOptions = {
  deckId: string;
  /** Called once per finished and confirmed upload with the recorded `publicId`. */
  onUploaded: (publicId: string) => void;
  /** Tests inject these; production signs through the API and uploads with XHR. */
  signer?: Signer;
  upload?: typeof signAndUpload;
  /** Records the upload with the API (D157); a photo is attached only once this succeeds. */
  confirm?: (deckId: string, uploaded: UploadedImage) => Promise<MediaAsset>;
  /** Sends a failed upload's details to the API log (Cloudinary answers only the browser). */
  report?: (deckId: string, report: MediaUploadFailureRequest) => Promise<void>;
};

function failure(error: unknown): { message: string; canRetry: boolean } {
  if (error instanceof UploadError) return { message: error.message, canRetry: true };
  if (isApiError(error)) {
    if (error.status === 429) {
      return { message: 'Too many uploads right now. Try again later.', canRetry: true };
    }
    if (error.status === 503) {
      return { message: 'Image uploads are not available here.', canRetry: false };
    }
    if (error.status === 403 || error.status === 404) {
      return { message: "You can't add photos to this pocketbook.", canRetry: false };
    }
    if (error.status === 422) {
      return { message: "The photo couldn't be verified. Try adding it again.", canRetry: true };
    }
  }
  return {
    message: "Couldn't start the upload. Check your connection and retry.",
    canRetry: true,
  };
}

/**
 * D133: one photo upload at a time for the image editor. Starting a new upload cancels the
 * previous one; the picked file is kept so a failed upload can be retried without re-picking.
 */
export function useImageUpload({
  deckId,
  onUploaded,
  signer: injectedSigner,
  upload = signAndUpload,
  confirm = confirmMediaAsset,
  report = reportUploadFailure,
}: UseImageUploadOptions) {
  const [state, setState] = useState<ImageUploadState>({ status: 'idle' });
  const [signer] = useState(() => injectedSigner ?? cachedSigner(() => signMediaUpload(deckId)));
  const file = useRef<File | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latestOnUploaded = useRef(onUploaded);

  useEffect(() => {
    latestOnUploaded.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (picked: File) => {
      controller.current?.abort();
      const attempt = new AbortController();
      controller.current = attempt;
      setState({ status: 'signing' });
      try {
        const uploaded = await upload(picked, signer, {
          signal: attempt.signal,
          onProgress: (percent) => {
            if (!attempt.signal.aborted) setState({ status: 'uploading', percent });
          },
        });
        if (attempt.signal.aborted) return;
        setState({ status: 'confirming' });
        const asset = await confirm(deckId, uploaded);
        if (attempt.signal.aborted) return;
        controller.current = null;
        setState({ status: 'idle' });
        latestOnUploaded.current(asset.publicId);
      } catch (error) {
        if (controller.current !== attempt) return;
        controller.current = null;
        if (error instanceof UploadError && error.reason === 'aborted') {
          setState({ status: 'idle' });
          return;
        }
        setState({ status: 'failed', ...failure(error) });
        const failed = uploadFailureReport(error, picked);
        if (failed) {
          // Best effort: the member already sees the failure; a lost report only costs a log line.
          report(deckId, failed).catch((reportError: unknown) => {
            console.warn('Upload failure report not sent', reportError);
          });
        }
      }
    },
    [confirm, deckId, report, signer, upload],
  );

  return {
    state,
    busy:
      state.status === 'signing' || state.status === 'uploading' || state.status === 'confirming',
    start: (picked: File) => {
      file.current = picked;
      void run(picked);
    },
    retry: () => {
      if (file.current) void run(file.current);
    },
    cancel: () => {
      controller.current?.abort();
      controller.current = null;
      setState({ status: 'idle' });
    },
    /** Forgets the kept file (after Remove). */
    reset: () => {
      controller.current?.abort();
      controller.current = null;
      file.current = null;
      setState({ status: 'idle' });
    },
  };
}
