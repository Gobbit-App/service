/** Contract §3: what a key press does in Browse. */
export type BrowseKeyAction =
  'next-card' | 'prev-card' | 'next-category' | 'prev-category' | 'close';

const KEY_ACTIONS: Record<string, BrowseKeyAction> = {
  PageDown: 'next-card',
  ArrowDown: 'next-card',
  PageUp: 'prev-card',
  ArrowUp: 'prev-card',
  ArrowRight: 'next-category',
  ArrowLeft: 'prev-category',
  Escape: 'close',
};

/** Elements that own their keys: text entry, the category menu and the pane tabs. */
const OWNS_KEYS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"]';
const OWNS_HORIZONTAL = '[role="tablist"]';
const SCROLLABLE_BODY = '.browse-page__content';

/** True when the element (or an ancestor up to the card body) can scroll vertically. */
function inScrollableBody(target: Element): boolean {
  const body = target.closest(SCROLLABLE_BODY);
  return body !== null && body.scrollHeight > body.clientHeight;
}

/**
 * The action for a document keydown, or null when Browse must leave the key alone: modifier
 * chords, keys already handled, keys inside text fields/menus, ←/→ on the pane tabs, and ↑/↓
 * inside a card body that scrolls (it scrolls natively first).
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
  if (!target) return action;
  if (action !== 'close' && target.closest(OWNS_KEYS)) return null;
  if (
    (action === 'next-category' || action === 'prev-category') &&
    target.closest(OWNS_HORIZONTAL)
  ) {
    return null;
  }
  if (event.key.startsWith('Arrow') && (action === 'next-card' || action === 'prev-card')) {
    if (inScrollableBody(target)) return null;
  }
  return action;
}
