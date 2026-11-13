import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError, type Problem } from '../api/api-error';
import { confirmMediaAsset, reportUploadFailure, signMediaUpload } from '../api/media';
import type { MediaAsset, MediaKind, MediaUploadFailureRequest } from '@gobbit/shared';
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
  /** Called once per finished and confirmed upload with the recorded asset. */
  onUploaded: (asset: MediaAsset) => void;
  /** Tests inject these; production signs through the API (per kind, D389) and uploads with XHR. */
  signer?: Signer;
  upload?: typeof signAndUpload;
  /** Records the upload with the API (D157); a photo is attached only once this succeeds. */
  confirm?: (deckId: string, uploaded: UploadedImage) => Promise<MediaAsset>;
  /** Sends a failed upload's details to the API log (Cloudinary answers only the browser). */
  report?: (deckId: string, report: MediaUploadFailureRequest) => Promise<void>;
};

/** The server's message when a confirm refused the file itself (`path: 'file'`, D390). */
function fileRefusal(problem: Problem | null): string | null {
  const errors = Array.isArray(problem?.errors) ? (problem.errors as unknown[]) : [];
  for (const entry of errors) {
    const { path, message } = (entry ?? {}) as { path?: unknown; message?: unknown };
    if (path === 'file' && typeof message === 'string') return message;
  }
  return null;
}

/** What the member is told about a failed upload, and whether another try can help. */
export function failure(error: unknown): { message: string; canRetry: boolean } {
  if (error instanceof UploadError) return { message: error.message, canRetry: true };
  if (isApiError(error)) {
    if (error.status === 429) {
      return { message: 'Too many uploads right now. Try again later.', canRetry: true };
    }
    if (error.status === 503) {
      return { message: 'Uploads are not available here.', canRetry: false };
    }
    if (error.status === 403 || error.status === 404) {
      return { message: "You can't add files to this deck.", canRetry: false };
    }
    if (error.status === 422) {
      // FR-009: the file itself was refused (kind, size, unreadable PDF); another try won't help.
      const refused = fileRefusal(error.problem);
      if (refused) return { message: `${refused}.`, canRetry: false };
      return { message: "The file couldn't be verified. Try adding it again.", canRetry: true };
    }
  }
  return {
    message: "Couldn't start the upload. Check your connection and retry.",
    canRetry: true,
  };
}

/** One cached permission per kind: a PDF can't be uploaded with a photo's signature (D389). */
export function useKindSigners(deckId: string, injected?: Signer): (kind: MediaKind) => Signer {
  const [signers] = useState(() => new Map<MediaKind, Signer>());
  return useCallback(
    (kind: MediaKind): Signer => {
      if (injected) return injected;
      let signer = signers.get(kind);
      if (!signer) {
        signer = cachedSigner(() => signMediaUpload(deckId, kind));
        signers.set(kind, signer);
      }
      return signer;
    },
    [deckId, injected, signers],
  );
}

/** Logs a failed upload with the API; best effort (the member already sees the failure). */
export function sendFailureReport(
  error: unknown,
  file: Blob,
  deckId: string,
  report: NonNullable<UseImageUploadOptions['report']>,
): void {
  const failed = uploadFailureReport(error, file);
  if (!failed) return;
  report(deckId, failed).catch((reportError: unknown) => {
    console.warn('Upload failure report not sent', reportError);
  });
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
  const signerFor = useKindSigners(deckId, injectedSigner);
  const file = useRef<{ picked: File; kind: MediaKind } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latestOnUploaded = useRef(onUploaded);

  useEffect(() => {
    latestOnUploaded.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (picked: File, kind: MediaKind) => {
      controller.current?.abort();
      const attempt = new AbortController();
      controller.current = attempt;
      setState({ status: 'signing' });
      try {
        const uploaded = await upload(picked, signerFor(kind), {
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
        latestOnUploaded.current(asset);
      } catch (error) {
        if (controller.current !== attempt) return;
        controller.current = null;
        if (error instanceof UploadError && error.reason === 'aborted') {
          setState({ status: 'idle' });
          return;
        }
        setState({ status: 'failed', ...failure(error) });
        sendFailureReport(error, picked, deckId, report);
      }
    },
    [confirm, deckId, report, signerFor, upload],
  );

  return {
    state,
    busy:
      state.status === 'signing' || state.status === 'uploading' || state.status === 'confirming',
    /** Uploads `picked` as `kind` (photos unless said otherwise). */
    start: (picked: File, kind: MediaKind = 'image') => {
      file.current = { picked, kind };
      void run(picked, kind);
    },
    retry: () => {
      if (file.current) void run(file.current.picked, file.current.kind);
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
