import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { ItemType } from '@gobbit/shared';
import type { Draft } from './draft';

/** D145: what one stored draft holds. An unknown `v` is discarded on read. */
export type StoredDraft = {
  v: 1;
  draft: Draft;
  /** The card's `updatedAt` when editing began (edit), null for a new card. */
  baseUpdatedAt: string | null;
  /** ISO time of the last autosave. */
  savedAt: string;
};

/** The slice of idb-keyval the store needs; tests pass an in-memory version. */
export type DraftsKv = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

const DRAFT_VERSION = 1;

export const newDraftKey = (deckId: string, type: ItemType): string => `new:${deckId}:${type}`;
export const editDraftKey = (itemId: string): string => `edit:${itemId}`;

let idbStore: UseStore | null = null;

/** IndexedDB `gobbit-drafts`, separate from the persisted query cache (`gobbit:query-cache`). */
export function idbDraftsKv(): DraftsKv {
  idbStore ??= createStore('gobbit-drafts', 'drafts');
  const store = idbStore;
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    clear: () => clear(store),
  };
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<StoredDraft>;
  return (
    record.v === DRAFT_VERSION &&
    typeof record.draft === 'object' &&
    record.draft !== null &&
    typeof record.savedAt === 'string'
  );
}

export async function readDraft(
  key: string,
  kv: DraftsKv = idbDraftsKv(),
): Promise<StoredDraft | null> {
  const value = await kv.get(key);
  if (value === undefined) return null;
  if (!isStoredDraft(value)) {
    await kv.del(key);
    return null;
  }
  return value;
}

export async function writeDraft(
  key: string,
  draft: Draft,
  baseUpdatedAt: string | null,
  now: Date,
  kv: DraftsKv = idbDraftsKv(),
): Promise<void> {
  const value: StoredDraft = { v: DRAFT_VERSION, draft, baseUpdatedAt, savedAt: now.toISOString() };
  await kv.set(key, value);
}

export async function deleteDraft(key: string, kv: DraftsKv = idbDraftsKv()): Promise<void> {
  await kv.del(key);
}

/** Sign-out: no draft may stay on a shared phone (FR-013). */
export async function clearDrafts(kv: DraftsKv = idbDraftsKv()): Promise<void> {
  await kv.clear();
}
