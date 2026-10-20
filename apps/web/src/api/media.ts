import type { LinkPreview, MediaSignResponse } from '@pb/shared';
import { api, unwrap } from './client';

/** D133: a signed permission for one direct upload to Cloudinary (never cached). */
export function signMediaUpload(deckId: string): Promise<MediaSignResponse> {
  return unwrap(api.POST('/decks/{id}/media/sign', { params: { path: { id: deckId } } }));
}

/** D134: the page's preview through the API's guarded fetcher; `null` when it has none. */
export async function fetchLinkPreview(deckId: string, url: string): Promise<LinkPreview | null> {
  const { preview } = await unwrap(
    api.POST('/decks/{id}/link-preview', { params: { path: { id: deckId } }, body: { url } }),
  );
  return preview;
}
