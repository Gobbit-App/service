import { RECENT_SEARCHES_MAX } from '@pb/shared/search';

/** localStorage key for a deck's recent searches. */
export const recentSearchesKey = (deckSlug: string) => `gobbit:recent-searches:${deckSlug}`;

function defaultStorage(): Storage | undefined {
  try {
    const storage: Storage | undefined = globalThis.localStorage;
    return storage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Newest first; [] on missing/corrupt JSON/non-array/storage errors; capped at RECENT_SEARCHES_MAX. */
export function readRecentSearches(deckSlug: string, storage?: Pick<Storage, 'getItem'>): string[] {
  const target = storage ?? defaultStorage();
  if (!target) return [];
  try {
    const raw = target.getItem(recentSearchesKey(deckSlug));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

/** Trims q; blank returns the current list unchanged. Moves q to the front, dedupes case-insensitively, caps, persists. */
export function pushRecentSearch(
  deckSlug: string,
  q: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): string[] {
  const current = readRecentSearches(deckSlug, storage);
  const trimmed = q.trim();
  if (trimmed.length === 0) return current;

  const lower = trimmed.toLowerCase();
  const next = [trimmed, ...current.filter((s) => s.toLowerCase() !== lower)].slice(
    0,
    RECENT_SEARCHES_MAX,
  );

  const target = storage ?? defaultStorage();
  if (target) {
    try {
      target.setItem(recentSearchesKey(deckSlug), JSON.stringify(next));
    } catch {
      // Swallow storage failures; the in-memory list is still returned.
    }
  }
  return next;
}
