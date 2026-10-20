/** D139: a horizontal swipe counts at this distance… */
export const SWIPE_MIN_PX = 40;
/** …or at this speed (px/ms), as long as it moved at least `FLICK_MIN_PX`. */
export const SWIPE_MIN_VELOCITY = 0.3;
/** A fast flick shorter than this is a tap or a jitter, not a swipe. */
export const FLICK_MIN_PX = 10;

export type SwipeStep = 'next' | 'prev';

export interface DragSample {
  /** Horizontal movement since the pointer went down (px). */
  dx: number;
  /** Vertical movement since the pointer went down (px). */
  dy: number;
  /** Duration of the drag (ms). */
  durationMs: number;
  /** Horizontal speed at release (px/ms), when the gesture library measured it. */
  velocityX?: number;
}

/**
 * One drag → one step. Leftward is `next`, rightward is `prev`, whatever the text direction
 * (spec edge case "RTL text"). Mostly-vertical drags and taps give null.
 */
export function classifySwipe({ dx, dy, durationMs, velocityX }: DragSample): SwipeStep | null {
  const distance = Math.abs(dx);
  if (distance === 0 || distance <= Math.abs(dy)) return null;
  const velocity = velocityX ?? (durationMs > 0 ? distance / durationMs : 0);
  const far = distance >= SWIPE_MIN_PX;
  const fast = velocity >= SWIPE_MIN_VELOCITY && distance >= FLICK_MIN_PX;
  if (!far && !fast) return null;
  return dx < 0 ? 'next' : 'prev';
}
