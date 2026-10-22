import type {
  LinkPreview,
  MediaAsset,
  MediaAssetConfirmRequest,
  MediaSignResponse,
  MediaUploadFailureRequest,
} from '@pb/shared';
import { api, unwrap } from './client';

/** D133: a signed permission for one direct upload to Cloudinary (never cached). */
export function signMediaUpload(deckId: string): Promise<MediaSignResponse> {
  return unwrap(api.POST('/decks/{id}/media/sign', { params: { path: { id: deckId } } }));
}

/** D157: records a finished direct upload from Cloudinary's signed answer (idempotent). */
export function confirmMediaAsset(
  deckId: string,
  uploaded: MediaAssetConfirmRequest,
): Promise<MediaAsset> {
  return unwrap(
    api.POST('/decks/{id}/media/assets', { params: { path: { id: deckId } }, body: uploaded }),
  );
}

/** D134: the page's preview through the API's guarded fetcher; `null` when it has none. */
export async function fetchLinkPreview(deckId: string, url: string): Promise<LinkPreview | null> {
  const { preview } = await unwrap(
    api.POST('/decks/{id}/link-preview', { params: { path: { id: deckId } }, body: { url } }),
  );
  return preview;
}

/** Tells the API why a direct upload failed, so Cloudinary's refusal shows up in its logs. */
export async function reportUploadFailure(
  deckId: string,
  report: MediaUploadFailureRequest,
): Promise<void> {
  await unwrap(
    api.POST('/decks/{id}/media/upload-failures', {
      params: { path: { id: deckId } },
      body: report,
    }),
  );
}
