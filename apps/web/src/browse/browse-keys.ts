/** Contract §3: what a key press does in Browse. */
export type BrowseKeyAction = 'next-card' | 'prev-card' | 'close';

/** D247: cards page sideways, so ←/→ move between cards; ↑/↓ stay native (they scroll the page). */
const KEY_ACTIONS: Record<string, BrowseKeyAction> = {
  ArrowRight: 'next-card',
  PageDown: 'next-card',
  ArrowLeft: 'prev-card',
  PageUp: 'prev-card',
  Escape: 'close',
};

/** Elements that own their keys: text entry and open menus. */
const OWNS_KEYS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"]';

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
  if (target && action !== 'close' && target.closest(OWNS_KEYS)) return null;
  return action;
}
