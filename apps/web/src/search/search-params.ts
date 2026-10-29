import { SEARCH_Q_MAX, searchModes, type SearchMode } from '@gobbit/shared/search';

/** Typed `?q=&mode=` of `/d/$slug/search` (D79); a result list is a shareable URL. */
export interface SearchParams {
  q: string;
  mode: SearchMode;
}

function isSearchMode(value: unknown): value is SearchMode {
  return typeof value === 'string' && (searchModes as readonly string[]).includes(value);
}

/** Lenient parse: anything malformed falls back to an empty search. */
export function parseSearchParams(search: Record<string, unknown>): SearchParams {
  const q = typeof search.q === 'string' ? search.q.slice(0, SEARCH_Q_MAX) : '';
  return { q, mode: isSearchMode(search.mode) ? search.mode : 'search' };
}
