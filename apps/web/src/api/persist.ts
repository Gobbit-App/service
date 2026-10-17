import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { REVIEW_KEY, SEARCH_KEY } from './query-keys';

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

/** Query keys whose data never reaches IndexedDB: search (D79) and the review queue (D107). */
const NOT_PERSISTED: ReadonlySet<unknown> = new Set([SEARCH_KEY, REVIEW_KEY]);

/** Everything else follows the default rule. */
export function shouldPersistQuery(query: Query): boolean {
  return !NOT_PERSISTED.has(query.queryKey[0]) && defaultShouldDehydrateQuery(query);
}
