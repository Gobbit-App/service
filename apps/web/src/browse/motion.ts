/** Contract §3: reduced motion pages instantly (`behavior: 'auto'`) and drops the depth effect. */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function pagingBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** Cards move on y, categories on x (D325). */
export type TrackAxis = 'x' | 'y';

/**
 * The page element of `id` on the track, a direct child carrying `attr` (ids are compared,
 * never put in a selector).
 */
export function pageElement(
  container: HTMLElement | null,
  id: string,
  attr = 'data-item-id',
): HTMLElement | null {
  if (!container) return null;
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && child.getAttribute(attr) === id) return child;
  }
  return null;
}

/**
 * D325: bring page `id` to the start of its track by scrolling only that track. The tracks are
 * nested, so `scrollIntoView` would also move the other one. Tracks are `position: relative`,
 * which makes the page's offset relative to the track.
 */
export function scrollToPage(
  container: HTMLElement | null,
  id: string,
  behavior: ScrollBehavior,
  { axis = 'y', attr }: { axis?: TrackAxis; attr?: string } = {},
): boolean {
  const page = pageElement(container, id, attr);
  if (!container || !page || typeof container.scrollTo !== 'function') return false;
  container.scrollTo(
    axis === 'y' ? { top: page.offsetTop, behavior } : { left: page.offsetLeft, behavior },
  );
  return true;
}

/** D337: a key move on a tall card scrolls 85 % of the screen before it pages. */
export const KEY_SCROLL_FRACTION = 0.85;

/**
 * How far a key press should scroll inside the current page before paging, or 0 when the page
 * is already at that end (it then pages). `direction` 1 = down, -1 = up.
 */
export function tallScrollStep(
  container: Pick<HTMLElement, 'scrollTop' | 'clientHeight'>,
  page: Pick<HTMLElement, 'offsetTop' | 'offsetHeight'>,
  direction: 1 | -1,
): number {
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  const pageBottom = page.offsetTop + page.offsetHeight;
  // A pixel of slack absorbs sub-pixel snapping.
  const remaining = direction === 1 ? pageBottom - viewBottom : viewTop - page.offsetTop;
  if (remaining <= 1) return 0;
  return direction * Math.min(remaining, container.clientHeight * KEY_SCROLL_FRACTION);
}
