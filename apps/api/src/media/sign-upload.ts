import { v2 as cloudinary } from 'cloudinary';
import {
  MEDIA_FORMATS,
  MEDIA_SIGN_TTL_MS,
  mediaEagerParam,
  resourceTypeForKind,
  type MediaKind,
  type MediaSignResponse,
} from '@gobbit/shared';
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
 * D133/D389: the signed parameters for one direct browser → Cloudinary upload of one kind of
 * file. Everything the browser sends besides `file`, `api_key` and `signature` is covered by the
 * signature, so the folder, tags, formats and eager renditions can't be changed client-side, and
 * the provider stores only the signed kind's formats. The secret never leaves this function.
 */
export function signEditorUpload(
  creds: CloudinaryCredentials,
  deckId: string,
  now: Date,
  { kind, maxBytes }: { kind: MediaKind; maxBytes: number },
): MediaSignResponse {
  const timestamp = Math.floor(now.getTime() / 1000);
  const eager = mediaEagerParam(kind);
  const params: Record<string, string | number | boolean> = {
    allowed_formats: MEDIA_FORMATS[kind].join(','),
    folder: editorUploadFolder(deckId),
    tags: [EDITOR_UPLOAD_TAG, deckTag(deckId)].join(','),
    timestamp,
    // D392: audio and video renditions are generated at upload, so playback never waits.
    ...(eager ? { eager, eager_async: true } : {}),
  };
  const signature = cloudinary.utils.api_sign_request(params, creds.apiSecret);

  return {
    kind,
    uploadUrl: `https://api.cloudinary.com/v1_1/${creds.cloudName}/${resourceTypeForKind(kind)}/upload`,
    apiKey: creds.apiKey,
    timestamp,
    signature,
    folder: params['folder'] as string,
    tags: params['tags'] as string,
    allowedFormats: params['allowed_formats'] as string,
    maxBytes,
    expiresAt: new Date(timestamp * 1000 + MEDIA_SIGN_TTL_MS).toISOString(),
    ...(eager ? { eager, eagerAsync: true } : {}),
  };
}
