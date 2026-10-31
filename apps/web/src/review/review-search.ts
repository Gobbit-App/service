import { IMPORT_LABEL_MAX } from '@gobbit/shared/ingest-constants';

export type ReviewSearch = { source?: string };

/** D191: `?source=<label>` narrows the queue to one import; anything else is dropped. */
export function parseReviewSearch(search: Record<string, unknown>): ReviewSearch {
  const source = typeof search.source === 'string' ? search.source.trim() : '';
  return source !== '' && source.length <= IMPORT_LABEL_MAX ? { source } : {};
}
