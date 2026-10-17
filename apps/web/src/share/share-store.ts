import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { isExpired, type SharedPayload } from './share-payload';

/** D98: one pending share at a time; a new share replaces the previous one. */
const PENDING_KEY = 'pending';

/** The slice of idb-keyval the store needs; tests pass an in-memory version. */
export type ShareKv = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

let idbStore: UseStore | null = null;

/** IndexedDB `gobbit-share` (separate from the query cache, which is cleared on sign-out). */
export function idbShareKv(): ShareKv {
  idbStore ??= createStore('gobbit-share', 'pending');
  const store = idbStore;
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  };
}

export async function savePending(payload: SharedPayload, kv: ShareKv = idbShareKv()) {
  await kv.set(PENDING_KEY, payload);
}

/**
 * The pending share with this id, or null when it's gone, replaced by a newer share or
 * older than the TTL (an expired record is removed).
 */
export async function readPending(
  id: string,
  now: number,
  kv: ShareKv = idbShareKv(),
): Promise<SharedPayload | null> {
  const payload = (await kv.get(PENDING_KEY)) as SharedPayload | undefined;
  if (!payload || payload.id !== id) return null;
  if (isExpired(payload, now)) {
    await kv.del(PENDING_KEY);
    return null;
  }
  return payload;
}

export async function clearPending(kv: ShareKv = idbShareKv()): Promise<void> {
  await kv.del(PENDING_KEY);
}
