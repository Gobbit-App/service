import { useEffect, useState, type RefObject } from 'react';

/** D139: a page is current once 60 % of it shows in the snap container. */
export const CURRENT_THRESHOLD = 0.6;
/** The address and the return entry follow the card only after it stays put this long. */
export const SETTLE_MS = 300;

/** The page attribute the observer reads the card id from. */
export const PAGE_ID_ATTR = 'data-item-id';

/** The most visible page at or over the threshold, or null when none qualifies. */
export function currentFromEntries(
  entries: readonly Pick<
    IntersectionObserverEntry,
    'isIntersecting' | 'intersectionRatio' | 'target'
  >[],
): string | null {
  let best: { id: string; ratio: number } | null = null;
  for (const entry of entries) {
    if (!entry.isIntersecting || entry.intersectionRatio < CURRENT_THRESHOLD) continue;
    const id = entry.target.getAttribute(PAGE_ID_ATTR);
    if (id && (!best || entry.intersectionRatio > best.ratio)) {
      best = { id, ratio: entry.intersectionRatio };
    }
  }
  return best?.id ?? null;
}

/**
 * Data-model §2: the current card is tracked by id (never by index), from one
 * IntersectionObserver rooted at the snap container. `settledId` trails it by `SETTLE_MS`.
 * `pagesKey` changes whenever the set of pages does, so new pages get observed.
 */
export function useCurrentCard({
  container,
  initialId,
  pagesKey,
}: {
  container: RefObject<HTMLElement | null>;
  initialId: string | null;
  pagesKey: string;
}): { currentId: string | null; settledId: string | null } {
  const [currentId, setCurrentId] = useState(initialId);
  const [settledId, setSettledId] = useState(initialId);

  useEffect(() => {
    const root = container.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const id = currentFromEntries(entries);
        if (id) setCurrentId(id);
      },
      { root, threshold: CURRENT_THRESHOLD },
    );
    root.querySelectorAll(`[${PAGE_ID_ATTR}]`).forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [container, pagesKey]);

  useEffect(() => {
    if (currentId === settledId) return;
    const timer = setTimeout(() => setSettledId(currentId), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [currentId, settledId]);

  return { currentId, settledId };
}
