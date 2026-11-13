import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type Scroller = Pick<Window, 'addEventListener' | 'removeEventListener' | 'scrollBy'>;

/** Where the reader's card sat on screen the last time we looked. */
type Place = { id: string; top: number };

export interface KeepPlaceOptions {
  /** Changes whenever the cards may have moved (the query's data). */
  data: unknown;
  /** What scrolls: the window (the list) or Browse's track. */
  scroller: () => Scroller | null;
  /** The id of the card the reader is on, or null. */
  anchorId: () => string | null;
  /** That card's element. */
  element: (id: string) => Element | null;
}

/**
 * D401: when the cards change under the reader (a background refetch adds, removes or resizes a
 * card above them), scroll by exactly as far as their card moved, before the browser paints, so
 * the screen doesn't jump. Done by hand: native scroll anchoring is missing in Safari and doesn't
 * apply to Browse's snap track.
 */
export function useKeepPlace(options: KeepPlaceOptions): void {
  const latest = useRef(options);
  const place = useRef<Place | null>(null);

  // Declared first, so the place check below sees this render's callbacks.
  useLayoutEffect(() => {
    latest.current = options;
  });

  const record = useCallback(() => {
    const { anchorId, element } = latest.current;
    const id = anchorId();
    const node = id === null ? null : element(id);
    place.current = id !== null && node ? { id, top: node.getBoundingClientRect().top } : null;
  }, []);

  useEffect(() => {
    const target = latest.current.scroller();
    if (!target) return;
    target.addEventListener('scroll', record, { passive: true });
    return () => target.removeEventListener('scroll', record);
  }, [record]);

  const { data } = options;
  useLayoutEffect(() => {
    const before = place.current;
    const { scroller, element } = latest.current;
    const node = before ? element(before.id) : null;
    const target = scroller();
    if (before && node && target) {
      const shift = node.getBoundingClientRect().top - before.top;
      if (Math.abs(shift) >= 1) target.scrollBy({ top: shift, behavior: 'instant' });
    }
    record();
  }, [data, record]);
}
