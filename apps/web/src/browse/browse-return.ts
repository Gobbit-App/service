import type { KeyValueStore } from '../lib/last-deck';

/**
 * Data-model §3: the card Browse was on, so the list it returns to can scroll to it. Session
 * scoped (one Browse → list hop). Imported by `ItemList`, so it must stay dependency-free.
 */
export const BROWSE_RETURN_KEY = 'gobbit:browse-return';
/** FR-005: the list a Browse was opened from, so back after a category change can be redirected. */
export const BROWSE_OPENER_KEY = 'gobbit:browse-opener';
/** The history index TanStack Router keeps in `history.state` (`@tanstack/history`). */
const HISTORY_INDEX_KEY = '__TSR_index';

export interface BrowseReturn {
  deckSlug: string;
  /** `'all'` or `'category:<slug>'` (`filterKey` in browse-params). */
  filterKey: string;
  itemId: string;
}

export interface BrowseOpener {
  deckSlug: string;
  /** The opening list's `filterKey`. */
  filterKey: string;
  /** That list's history index (the Browse entry's index − 1). */
  historyIndex: number;
}

export function sessionStore(): KeyValueStore | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** The router's index of a history entry, or null when the state has none. */
export function historyIndex(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const index = (state as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof index === 'number' && Number.isInteger(index) ? index : null;
}

function isBrowseReturn(value: unknown): value is BrowseReturn {
  if (typeof value !== 'object' || value === null) return false;
  const { deckSlug, filterKey, itemId } = value as Record<string, unknown>;
  return (
    typeof deckSlug === 'string' && typeof filterKey === 'string' && typeof itemId === 'string'
  );
}

function isBrowseOpener(value: unknown): value is BrowseOpener {
  if (typeof value !== 'object' || value === null) return false;
  const { deckSlug, filterKey, historyIndex: index } = value as Record<string, unknown>;
  return typeof deckSlug === 'string' && typeof filterKey === 'string' && typeof index === 'number';
}

function readJson(key: string, store: KeyValueStore | null): unknown {
  if (store === null) return null;
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, store: KeyValueStore | null): void {
  if (store === null) return;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the list keeps its normal scroll restoration.
  }
}

export function writeBrowseReturn(
  entry: BrowseReturn,
  store: KeyValueStore | null = sessionStore(),
): void {
  writeJson(BROWSE_RETURN_KEY, entry, store);
}

/** Records (or, for a Browse not opened from a list, forgets) the list Browse was opened from. */
export function writeBrowseOpener(
  opener: BrowseOpener | null,
  store: KeyValueStore | null = sessionStore(),
): void {
  writeJson(BROWSE_OPENER_KEY, opener, store);
}

/** The entry when it belongs to this deck and filter, else null (malformed or storage errors too). */
export function readBrowseReturn(
  deckSlug: string,
  filterKey: string,
  store: KeyValueStore | null = sessionStore(),
): BrowseReturn | null {
  const parsed = readJson(BROWSE_RETURN_KEY, store);
  if (!isBrowseReturn(parsed)) return null;
  return parsed.deckSlug === deckSlug && parsed.filterKey === filterKey ? parsed : null;
}

/**
 * FR-005: the system back action after a category change in Browse lands on the list Browse was
 * opened from. Returns the `filterKey` of the category Browse ended on when this list is that
 * opening entry (same deck, filter and history index), else null. The index check keeps a later
 * visit to the same list (e.g. from a card page) from being redirected.
 */
export function browseReturnRedirect(
  deckSlug: string,
  filterKey: string,
  currentIndex: number | null,
  store: KeyValueStore | null = sessionStore(),
): string | null {
  if (currentIndex === null) return null;
  const opener = readJson(BROWSE_OPENER_KEY, store);
  const entry = readJson(BROWSE_RETURN_KEY, store);
  if (!isBrowseOpener(opener) || !isBrowseReturn(entry)) return null;
  const isOpeningList =
    opener.deckSlug === deckSlug &&
    opener.filterKey === filterKey &&
    opener.historyIndex === currentIndex;
  const moved = entry.deckSlug === deckSlug && entry.filterKey !== filterKey;
  return isOpeningList && moved ? entry.filterKey : null;
}

export function clearBrowseReturn(store: KeyValueStore | null = sessionStore()): void {
  writeJson(BROWSE_RETURN_KEY, null, store);
  writeJson(BROWSE_OPENER_KEY, null, store);
}
