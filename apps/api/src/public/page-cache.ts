import { LRUCache } from 'lru-cache';

/** D180: entries and lifetime of the in-process public page cache. */
export const PUBLIC_PAGE_CACHE_MAX = 500;
export const PUBLIC_PAGE_CACHE_TTL_MS = 300_000;

/** A rendered anonymous page. Redirects and members' responses are never stored. */
export type CachedPage = { status: 200 | 404; html: string; headers: Record<string, string> };

export interface PageCacheOptions {
  max?: number;
  ttlMs?: number;
  /** Clock for TTL checks (tests); defaults to `performance.now`. */
  now?: () => number;
}

/**
 * D180: rendered pages keyed `${generation}:${key}` per deck. `purgeDeck` bumps the deck's
 * generation so every older entry stops matching and ages out; no key scan needed.
 */
export function createPageCache({
  max = PUBLIC_PAGE_CACHE_MAX,
  ttlMs = PUBLIC_PAGE_CACHE_TTL_MS,
  now,
}: PageCacheOptions = {}) {
  const pages = new LRUCache<string, CachedPage>({
    max,
    ttl: ttlMs,
    ttlAutopurge: false,
    ttlResolution: 0,
    ...(now ? { perf: { now } } : {}),
  });
  const generations = new Map<string, number>();

  const fullKey = (deckId: string, key: string) =>
    `${deckId}:${generations.get(deckId) ?? 0}:${key}`;

  return {
    get(deckId: string, key: string): CachedPage | undefined {
      return pages.get(fullKey(deckId, key));
    },

    set(deckId: string, key: string, page: CachedPage): void {
      pages.set(fullKey(deckId, key), page);
    },

    /** Call after the commit of any write that changes what strangers see in the deck. */
    purgeDeck(deckId: string): void {
      generations.set(deckId, (generations.get(deckId) ?? 0) + 1);
    },

    get size(): number {
      return pages.size;
    },
  };
}

export type PageCache = ReturnType<typeof createPageCache>;

/** D180: `path?query` with only the page-relevant query keys, sorted. */
export function pageCacheKey(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const name of Object.keys(query).sort()) {
    const value = query[name];
    if (value !== undefined) params.set(name, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
