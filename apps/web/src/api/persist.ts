import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { SEARCH_KEY } from './query-keys';

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

/** D79: search results never reach IndexedDB; everything else follows the default rule. */
export function shouldPersistQuery(query: Query): boolean {
  return query.queryKey[0] !== SEARCH_KEY && defaultShouldDehydrateQuery(query);
}
