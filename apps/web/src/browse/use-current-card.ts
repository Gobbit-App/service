import { useCallback, useEffect, useState, type RefObject } from 'react';

/** D139: a page is current once it fills 60 % of the snap container (or 60 % of it shows). */
export const CURRENT_THRESHOLD = 0.6;
/** The address and the return entry follow the card only after it stays put this long. */
export const SETTLE_MS = 300;

/** The page attribute the observer reads the card id from. */
export const PAGE_ID_ATTR = 'data-item-id';

/** D326: a tall page never shows 60 % of itself, so callbacks fire every 5 % of it. */
export const OBSERVER_THRESHOLDS = Array.from({ length: 21 }, (_, n) => n / 20);

type Entry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'intersectionRatio' | 'target'> &
  Partial<Pick<IntersectionObserverEntry, 'intersectionRect' | 'rootBounds'>>;

/**
 * How much of the page shows, or how much of the root it fills, whichever is larger. The second
 * makes a card taller than the screen current while it covers the screen (D326).
 */
export function coverage(entry: Entry): number {
  const { intersectionRect: rect, rootBounds: root } = entry;
  const rootArea = root ? root.width * root.height : 0;
  const filled = rect && rootArea > 0 ? (rect.width * rect.height) / rootArea : 0;
  return Math.max(entry.intersectionRatio, filled);
}

/** The best-covered page at or over the threshold, or null when none qualifies. */
export function currentFromEntries(
  entries: readonly Entry[],
  attr: string = PAGE_ID_ATTR,
): string | null {
  let best: { id: string; value: number } | null = null;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const value = coverage(entry);
    if (value < CURRENT_THRESHOLD) continue;
    const id = entry.target.getAttribute(attr);
    if (id && (!best || value > best.value)) best = { id, value };
  }
  return best?.id ?? null;
}

/**
 * Data-model §3: the current page is tracked by id (never by index), from one
 * IntersectionObserver rooted at the snap container, watching its direct children that carry
 * `attr`. `settledId` trails it by `SETTLE_MS`. `pagesKey` changes whenever the set of pages
 * does, so new pages get observed. `force(id)` moves both at once (a jump, D328), so the jump
 * never reads as a swipe.
 */
export function useCurrentCard({
  container,
  initialId,
  pagesKey,
  attr = PAGE_ID_ATTR,
  enabled = true,
}: {
  container: RefObject<HTMLElement | null>;
  initialId: string | null;
  pagesKey: string;
  attr?: string;
  /** Off for a track the reader isn't on (D328). */
  enabled?: boolean;
}): { currentId: string | null; settledId: string | null; force: (id: string) => void } {
  const [currentId, setCurrentId] = useState(initialId);
  const [settledId, setSettledId] = useState(initialId);

  useEffect(() => {
    const root = container.current;
    if (!enabled || !root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const id = currentFromEntries(entries, attr);
        if (id) setCurrentId(id);
      },
      { root, threshold: OBSERVER_THRESHOLDS },
    );
    for (const page of Array.from(root.children)) {
      if (page.hasAttribute(attr)) observer.observe(page);
    }
    return () => observer.disconnect();
  }, [container, pagesKey, attr, enabled]);

  useEffect(() => {
    if (currentId === settledId) return;
    const timer = setTimeout(() => setSettledId(currentId), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [currentId, settledId]);

  const force = useCallback((id: string) => {
    setCurrentId(id);
    setSettledId(id);
  }, []);

  return { currentId, settledId, force };
}
