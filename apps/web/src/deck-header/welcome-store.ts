import { defaultStore, type KeyValueStore } from '../lib/last-deck';

export const WELCOME_DISMISSED_KEY = 'gobbit:welcome-dismissed:v1';

/** Membership ids dismissed on this device but not yet confirmed by the server; unreadable storage reads as empty. */
export function readPendingDismissals(store: KeyValueStore | null = defaultStore()): string[] {
  if (store === null) return [];
  try {
    const v: unknown = JSON.parse(store.getItem(WELCOME_DISMISSED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: string[], store: KeyValueStore | null): void {
  if (store === null) return;
  try {
    if (ids.length === 0) store.removeItem(WELCOME_DISMISSED_KEY);
    else store.setItem(WELCOME_DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or quota: the welcome may show again, which is acceptable.
  }
}

export function addPendingDismissal(
  id: string,
  store: KeyValueStore | null = defaultStore(),
): void {
  const ids = readPendingDismissals(store);
  if (!ids.includes(id)) write([...ids, id], store);
}

export function removePendingDismissal(
  id: string,
  store: KeyValueStore | null = defaultStore(),
): void {
  write(
    readPendingDismissals(store).filter((x) => x !== id),
    store,
  );
}
