/** Contract §2: what a key press does in Browse. */
export type BrowseKeyAction =
  'next-card' | 'prev-card' | 'next-category' | 'prev-category' | 'full-view' | 'close';

/** D337: cards move vertically (↑/↓), categories sideways (←/→); `f` opens full view. */
const KEY_ACTIONS: Record<string, BrowseKeyAction> = {
  ArrowDown: 'next-card',
  PageDown: 'next-card',
  ArrowUp: 'prev-card',
  PageUp: 'prev-card',
  ArrowRight: 'next-category',
  ArrowLeft: 'prev-category',
  f: 'full-view',
  Escape: 'close',
};

/** Elements that own their keys: text entry and open menus. */
const OWNS_KEYS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"]';

/** Content that scrolls sideways on its own keeps ←/→ (a focused wide table, FR-009). */
const OWNS_SIDEWAYS_KEYS = '.table-card';

/**
 * The action for a document keydown, or null when Browse must leave the key alone: modifier
 * chords, keys already handled, and keys inside text fields or menus (Escape still closes).
 */
export function browseKeyAction(
  event: Pick<
    KeyboardEvent,
    'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented'
  > & {
    target: EventTarget | null;
  },
): BrowseKeyAction | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  const action = KEY_ACTIONS[event.key];
  if (!action) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || action === 'close') return action;
  if (target.closest(OWNS_KEYS)) return null;
  if (
    (action === 'next-category' || action === 'prev-category') &&
    target.closest(OWNS_SIDEWAYS_KEYS)
  ) {
    return null;
  }
  return action;
}
