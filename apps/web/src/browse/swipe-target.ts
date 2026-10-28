/** Text entry keeps its own drags (caret moves, selection). */
const TEXT_ENTRY =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/** True when the element scrolls sideways (a wide table, a chip row that overflows). */
function scrollsHorizontally(element: Element): boolean {
  if (element.scrollWidth <= element.clientWidth) return false;
  const overflowX = getComputedStyle(element).overflowX;
  return overflowX === 'auto' || overflowX === 'scroll';
}

/**
 * D218: a sideways drag on the card changes the pane, except when it starts on something that
 * owns sideways drags itself: text entry, or anything that scrolls horizontally, up to (not
 * including) the element the swipe is bound to.
 */
export function ownsSidewaysDrag(target: EventTarget | null, zone: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(TEXT_ENTRY)) return true;
  for (let el: Element | null = target; el && el !== zone; el = el.parentElement) {
    if (scrollsHorizontally(el)) return true;
  }
  return false;
}
