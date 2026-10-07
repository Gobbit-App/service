import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

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
