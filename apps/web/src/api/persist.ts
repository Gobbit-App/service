import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query, type QueryClient } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { ADMIN_KEY, EVENTS_KEY, REVIEW_KEY, SEARCH_KEY } from './query-keys';

/** IndexedDB key holding the dehydrated query cache (D56). */
export const PERSIST_KEY = 'gobbit:query-cache';

/** Persists the query cache to IndexedDB; the service worker never caches API data (D56). */
export function createIdbPersister(): Persister {
  return createAsyncStoragePersister({
    key: PERSIST_KEY,
    storage: {
      getItem: async (key) => (await get<string>(key)) ?? null,
      setItem: (key, value: string) => set(key, value),
      removeItem: (key) => del(key),
    },
  });
}

/**
 * Query keys whose data never reaches IndexedDB: search (D79), the review queue (D107), the
 * activity log (D188) and the platform admin's waitlist (032).
 */
const NOT_PERSISTED: ReadonlySet<unknown> = new Set([
  SEARCH_KEY,
  REVIEW_KEY,
  EVENTS_KEY,
  ADMIN_KEY,
]);

/** Everything else follows the default rule. */
export function shouldPersistQuery(query: Query): boolean {
  return !NOT_PERSISTED.has(query.queryKey[0]) && defaultShouldDehydrateQuery(query);
}

/**
 * Called once the persisted cache is restored. Writes to IndexedDB are throttled (1 s), so a reload
 * right after a save can restore the pre-save copy with a still-fresh timestamp. Restored data
 * renders at once (and offline), but active queries always revalidate on boot.
 */
export function revalidateRestored(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries();
}
