import { v2 as cloudinary } from 'cloudinary';
import {
  MEDIA_IMAGE_FORMATS,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_SIGN_TTL_MS,
  type MediaSignResponse,
} from '@pb/shared';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';

/** Tag on every editor upload; with `deck:<id>` it lets Phase 7 find a deck's images (D129). */
export const EDITOR_UPLOAD_TAG = 'editor';

/** Folder that holds a deck's editor uploads (ingest uses `gobbit/ingest/<deckId>`). */
export function editorUploadFolder(deckId: string): string {
  return `gobbit/items/${deckId}`;
}

export function deckTag(deckId: string): string {
  return `deck:${deckId}`;
}

/**
 * D133: the signed parameters for one direct browser → Cloudinary upload. Everything the
 * browser sends besides `file`, `api_key` and `signature` is covered by the signature, so the
 * folder, tags and formats can't be changed client-side. The secret never leaves this function.
 */
export function signEditorUpload(
  creds: CloudinaryCredentials,
  deckId: string,
  now: Date,
): MediaSignResponse {
  const timestamp = Math.floor(now.getTime() / 1000);
  const params = {
    allowed_formats: MEDIA_IMAGE_FORMATS.join(','),
    folder: editorUploadFolder(deckId),
    tags: [EDITOR_UPLOAD_TAG, deckTag(deckId)].join(','),
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(params, creds.apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`,
    apiKey: creds.apiKey,
    timestamp,
    signature,
    folder: params.folder,
    tags: params.tags,
    allowedFormats: params.allowed_formats,
    maxBytes: MEDIA_IMAGE_MAX_BYTES,
    expiresAt: new Date(timestamp * 1000 + MEDIA_SIGN_TTL_MS).toISOString(),
  };
}
