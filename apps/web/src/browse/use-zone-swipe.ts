import { useDrag } from '@use-gesture/react';
import { isEdgeStart } from './edge-guard';
import { classifySwipe, type SwipeStep } from './swipe';

/** The part of use-gesture's drag state the zone handler reads. */
export interface ZoneDragState {
  first: boolean;
  last: boolean;
  tap: boolean;
  canceled: boolean;
  /** Pointer position at pointer-down (client px). */
  initial: [number, number];
  /** Current pointer position (client px). */
  xy: [number, number];
  /** Absolute speed per axis (px/ms). */
  velocity: [number, number];
  elapsedTime: number;
  cancel: () => void;
}

/**
 * D139/D140: one horizontal drag on a band → at most one step, decided on release. Starts in
 * the edge guard are dropped at once, so the system back gesture keeps them.
 */
export function zoneSwipeHandler(
  onStep: (step: SwipeStep) => void,
  viewportWidth: () => number = () => window.innerWidth,
): (state: ZoneDragState) => void {
  return (state) => {
    if (isEdgeStart(state.initial[0], viewportWidth())) {
      if (state.first) state.cancel();
      return;
    }
    if (!state.last || state.tap || state.canceled) return;
    const step = classifySwipe({
      dx: state.xy[0] - state.initial[0],
      dy: state.xy[1] - state.initial[1],
      durationMs: state.elapsedTime,
      velocityX: state.velocity[0],
    });
    if (step) onStep(step);
  };
}

/**
 * Binds the zone swipe to a band (spread `{...bind()}` on it). The band's CSS sets
 * `touch-action: pan-y`, so vertical drags stay native scrolling of the snap container.
 */
export function useZoneSwipe(onStep: (step: SwipeStep) => void, enabled = true) {
  // use-gesture re-applies the handler on every render, so it always sees the latest `onStep`.
  return useDrag((state) => zoneSwipeHandler(onStep)(state as unknown as ZoneDragState), {
    axis: 'x',
    filterTaps: true,
    enabled,
    pointer: { keys: false },
  });
}
