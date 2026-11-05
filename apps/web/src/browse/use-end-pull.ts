import { useEffect, useRef, type RefObject } from 'react';

/** D330: a sideways pull this long past the first or last category shows the end banner. */
export const END_PULL_PX = 48;

export type PullDirection = 'next' | 'prev';

/** Touches that start here are not category pulls: a wide table, the side strips (D333). */
const NOT_A_PULL = '.table-card, .browse-edge';

/**
 * The category a horizontal pull asks for, or null for a short or mostly vertical move. The
 * category track is always `ltr` (D325): a pull to the left asks for the next category.
 */
export function pullDirection(dx: number, dy: number): PullDirection | null {
  if (Math.abs(dx) < END_PULL_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

/**
 * D330: native scroll-snap has nothing to show past the ends, so a passive touch watcher on the
 * track reports a pull towards a missing neighbour. It never prevents scrolling.
 */
export function useEndPull(
  track: RefObject<HTMLElement | null>,
  {
    hasPrev,
    hasNext,
    onEnd,
  }: { hasPrev: boolean; hasNext: boolean; onEnd: (direction: PullDirection) => void },
): void {
  const latest = useRef({ hasPrev, hasNext, onEnd });
  useEffect(() => {
    latest.current = { hasPrev, hasNext, onEnd };
  }, [hasPrev, hasNext, onEnd]);

  useEffect(() => {
    const root = track.current;
    if (!root) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      start =
        touch && event.touches.length === 1 && !target?.closest(NOT_A_PULL)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const onEndTouch = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const direction = pullDirection(touch.clientX - start.x, touch.clientY - start.y);
      start = null;
      const { hasPrev: prev, hasNext: next, onEnd: report } = latest.current;
      if (direction === 'next' && !next) report('next');
      if (direction === 'prev' && !prev) report('prev');
    };
    const onCancel = () => {
      start = null;
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchend', onEndTouch, { passive: true });
    root.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchend', onEndTouch);
      root.removeEventListener('touchcancel', onCancel);
    };
  }, [track]);
}
