/** Storage key for the last opened deck slug. */
export const LAST_DECK_KEY = 'gobbit:last-deck';

/** Minimal storage interface. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Returns localStorage if available, null if access throws. */
export function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Reads last opened deck slug from storage, returns null on error. */
export function readLastDeck(store: KeyValueStore | null = defaultStore()): string | null {
  if (store === null) return null;
  try {
    return store.getItem(LAST_DECK_KEY);
  } catch {
    return null;
  }
}

/** Writes last opened deck slug to storage, silently ignores errors. */
export function writeLastDeck(slug: string, store: KeyValueStore | null = defaultStore()): void {
  if (store === null) return;
  try {
    store.setItem(LAST_DECK_KEY, slug);
  } catch {
    // Silently ignore storage errors (quota, private mode, etc).
  }
}

/** Removes last deck slug from storage, silently ignores errors. */
export function clearLastDeck(store: KeyValueStore | null = defaultStore()): void {
  if (store === null) return;
  try {
    store.removeItem(LAST_DECK_KEY);
  } catch {
    // Silently ignore storage errors.
  }
}

/** Picks landing deck: last if in list, single deck if only one, else null. */
export function pickLanding(deckSlugs: readonly string[], last: string | null): string | null {
  if (last !== null && deckSlugs.includes(last)) {
    return last;
  }
  if (deckSlugs.length === 1) {
    return deckSlugs[0];
  }
  return null;
}
