import type {
  MediaAssetConfirmRequest,
  MediaSignResponse,
  MediaUploadFailureRequest,
} from '@pb/shared';
import { MEDIA_UPLOAD_FAILURE_MESSAGE_MAX } from '@pb/shared/media-constants';

/** Why an upload ended without a photo. */
export type UploadFailure =
  /** Cloudinary refused the signature as too old: sign again and retry once. */
  | 'stale'
  /** Cancelled by the member. */
  | 'aborted'
  /** Network failure or any other non-200 answer; the member may retry. */
  | 'failed';

export class UploadError extends Error {
  constructor(
    readonly reason: UploadFailure,
    message: string,
    /** Cloudinary's HTTP status; 0 when no answer came back, null when no request was made. */
    readonly status: number | null = null,
    /** Cloudinary's own `error.message`, kept for the failure report. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export type UploadOptions = {
  /** Whole percent, 0–100. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  /** Tests inject a fake; the browser's XMLHttpRequest otherwise (fetch has no upload progress). */
  createXhr?: () => XMLHttpRequest;
};

const STALE_RE = /stale request/i;
const DETAIL_SHOWN_MAX = 120;

/** What the member reads for a refused upload, from Cloudinary's status and message. */
export function failureMessage(status: number, detail: string | null): string {
  if (status === 0) return 'The upload failed. Check your connection and retry.';
  const text = detail ?? '';
  if (/file size too large/i.test(text)) {
    return 'This photo is too large to upload. Try a smaller copy.';
  }
  if (/resolution too high|megapixels/i.test(text)) {
    return "This photo's resolution is too high. Try a smaller or cropped copy.";
  }
  if (/format|not allowed/i.test(text)) {
    return "This file type isn't supported. Use a JPG, PNG, WebP or HEIC photo.";
  }
  if (status === 401 || /invalid signature|api_key/i.test(text)) {
    return 'Photo uploads are misconfigured on the server. Ask the deck owner to check them.';
  }
  if (!detail) return "The photo couldn't be uploaded.";
  const shown = detail.length > DETAIL_SHOWN_MAX ? `${detail.slice(0, DETAIL_SHOWN_MAX)}…` : detail;
  return `The photo couldn't be uploaded (${shown}).`;
}

function errorMessage(responseText: string): string | null {
  try {
    const body = JSON.parse(responseText) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : null;
  } catch {
    return null;
  }
}

/** What a finished upload hands to the API's confirm step (D157): Cloudinary's signed answer. */
export type UploadedImage = MediaAssetConfirmRequest;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** The signed fields of Cloudinary's 200 answer; null when any is missing. */
export function uploadedImageOf(responseText: string): UploadedImage | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    return null;
  }
  const { public_id, version, signature, width, height, bytes, format } = body;
  if (!isText(public_id) || !isNumber(version) || !isText(signature)) return null;
  if (!isNumber(width) || !isNumber(height) || !isNumber(bytes) || !isText(format)) return null;
  return { publicId: public_id, version, signature, width, height, bytes, format };
}

/** The multipart body contracts/media-sign.md lists: the file plus every signed parameter. */
export function uploadForm(file: Blob, signed: MediaSignResponse): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  form.append('tags', signed.tags);
  form.append('allowed_formats', signed.allowedFormats);
  return form;
}

/**
 * D133: POSTs the file straight to Cloudinary with the signed parameters and resolves with
 * its signed answer (`public_id`, `version`, `signature`, size). Rejects with an `UploadError`; never leaves a half-attached photo.
 */
export function uploadImage(
  file: Blob,
  signed: MediaSignResponse,
  { onProgress, signal, createXhr = () => new XMLHttpRequest() }: UploadOptions = {},
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError('aborted', 'Upload cancelled'));
      return;
    }
    const xhr = createXhr();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      done();
      const uploaded = xhr.status === 200 ? uploadedImageOf(xhr.responseText) : null;
      if (uploaded) {
        onProgress?.(100);
        resolve(uploaded);
        return;
      }
      const message = errorMessage(xhr.responseText);
      if ((xhr.status === 400 || xhr.status === 401) && message && STALE_RE.test(message)) {
        reject(new UploadError('stale', message, xhr.status, message));
        return;
      }
      reject(new UploadError('failed', failureMessage(xhr.status, message), xhr.status, message));
    };
    xhr.onerror = () => {
      done();
      reject(new UploadError('failed', failureMessage(0, null), 0, null));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadError('aborted', 'Upload cancelled'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.open('POST', signed.uploadUrl);
    xhr.send(uploadForm(file, signed));
  });
}

/** Hands out an upload permission; `fresh` skips any cached one. */
export type Signer = (options: { fresh: boolean }) => Promise<MediaSignResponse>;

/**
 * Reuses one permission while it is unexpired (`expiresAt`, 50 min after signing), so picking
 * another photo doesn't cost a sign, and asks for a new one transparently once it has expired.
 */
export function cachedSigner(
  sign: () => Promise<MediaSignResponse>,
  now: () => number = Date.now,
): Signer {
  let cached: MediaSignResponse | null = null;
  return async ({ fresh }) => {
    if (!fresh && cached && Date.parse(cached.expiresAt) > now()) return cached;
    cached = await sign();
    return cached;
  };
}

/** Signs, uploads, and on a stale-timestamp refusal signs again and retries exactly once. */
export async function signAndUpload(
  file: Blob,
  signer: Signer,
  options: UploadOptions = {},
): Promise<UploadedImage> {
  try {
    return await uploadImage(file, await signer({ fresh: false }), options);
  } catch (error) {
    if (!(error instanceof UploadError) || error.reason !== 'stale') throw error;
    return uploadImage(file, await signer({ fresh: true }), options);
  }
}

/** The API report for a failed upload; null for cancels and stale retries (nothing to fix). */
export function uploadFailureReport(error: unknown, file: Blob): MediaUploadFailureRequest | null {
  if (!(error instanceof UploadError) || error.reason !== 'failed') return null;
  return {
    status: error.status ?? 0,
    message: error.detail?.slice(0, MEDIA_UPLOAD_FAILURE_MESSAGE_MAX) ?? null,
    fileType: file.type ? file.type.slice(0, 100) : null,
    fileBytes: file.size,
  };
}
