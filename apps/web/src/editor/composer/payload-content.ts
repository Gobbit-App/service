import { newPayload, type Draft } from '../draft';
import { jsonEqual } from '../equal';

/**
 * D303 (039): does the card hold type-specific content that switching type would remove? It does
 * when its payload differs from the type's start (D270): a link URL or preview, a photo, table
 * cells, calc fields or reminder settings. An untouched sample switches freely.
 */
export function payloadHasContent(
  draft: Pick<Draft, 'type' | 'payload'>,
  start: Draft['payload'] = newPayload(draft.type),
): boolean {
  return !jsonEqual(draft.payload, start);
}
