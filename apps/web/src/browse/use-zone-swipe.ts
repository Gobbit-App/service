import { useDrag } from '@use-gesture/react';
import { useRef, type PointerEvent } from 'react';
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
 * D139/D140: one horizontal drag on a zone → at most one step, decided on release. Starts in
 * the edge guard are dropped at once, so the system back gesture keeps them; so are starts the
 * zone's `ignoreStart` claims (D218: text entry, horizontal scrollers).
 */
export function zoneSwipeHandler(
  onStep: (step: SwipeStep) => void,
  viewportWidth: () => number = () => window.innerWidth,
  ignored: () => boolean = () => false,
): (state: ZoneDragState) => void {
  return (state) => {
    if (ignored() || isEdgeStart(state.initial[0], viewportWidth())) {
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

/** Claims a drag for its start element (it handles sideways drags itself). */
export type IgnoreStart = (target: EventTarget | null, zone: Element) => boolean;

/**
 * Binds the zone swipe to an element (spread `{...bind()}` on it). The zone's CSS sets
 * `touch-action: pan-y`, so vertical drags stay native scrolling of the snap container.
 */
export function useZoneSwipe(
  onStep: (step: SwipeStep) => void,
  enabled = true,
  ignoreStart?: IgnoreStart,
) {
  // Decided at pointer-down, from the element the finger landed on.
  const startIgnored = useRef(false);
  // use-gesture re-applies the handler on every render, so it always sees the latest `onStep`.
  const bind = useDrag(
    (state) =>
      zoneSwipeHandler(
        onStep,
        undefined,
        () => startIgnored.current,
      )(state as unknown as ZoneDragState),
    { axis: 'x', filterTaps: true, enabled, pointer: { keys: false } },
  );
  return () => ({
    ...bind(),
    onPointerDownCapture: (event: PointerEvent<Element>) => {
      startIgnored.current = ignoreStart?.(event.target, event.currentTarget) ?? false;
    },
  });
}
