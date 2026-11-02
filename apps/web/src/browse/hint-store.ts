import { defaultStore, type KeyValueStore } from '../lib/last-deck';

/** Bump the version to show the hint again after a redesign (034: v2, D251). */
export const BROWSE_HINT_KEY = 'gobbit:browse-hint:v2';
const DISMISSED = 'dismissed';

/** True unless the hint was dismissed on this device; unreadable storage shows it again. */
export function shouldShowHint(store: KeyValueStore | null = defaultStore()): boolean {
  if (store === null) return true;
  try {
    return store.getItem(BROWSE_HINT_KEY) !== DISMISSED;
  } catch {
    return true;
  }
}

export function dismissHint(store: KeyValueStore | null = defaultStore()): void {
  if (store === null) return;
  try {
    store.setItem(BROWSE_HINT_KEY, DISMISSED);
  } catch {
    // Private mode or quota: the overlay shows again next time, which is acceptable.
  }
}
