import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';

export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 10;

export interface LongPressBind {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: SyntheticEvent) => void;
}

export interface LongPress {
  /** Spread on the trigger; empty when there is no `onLongPress`. */
  bind: Partial<LongPressBind>;
  /** True once after a long press fired: the click that follows it must be ignored. */
  consumeClick: () => boolean;
}

/**
 * D275: press and hold (≥ 500 ms, moving < 10 px) without a gesture library (ADR-065).
 * Releasing early is a normal click; the click after a fired long press is swallowed through
 * `consumeClick`, and the context menu (iOS callout, Android menu) is prevented while armed.
 */
export function useLongPress(
  onLongPress: (() => void) | undefined,
  { delayMs = LONG_PRESS_MS, slopPx = LONG_PRESS_SLOP_PX } = {},
): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  const enabled = onLongPress !== undefined;
  const bind = useMemo<Partial<LongPressBind>>(() => {
    if (!enabled) return {};
    return {
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        fired.current = false;
        cancel();
        start.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          start.current = null;
          fired.current = true;
          navigator.vibrate?.(10);
          callback.current?.();
        }, delayMs);
      },
      onPointerMove: (event) => {
        const origin = start.current;
        if (!origin) return;
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > slopPx) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (event) => {
        if (start.current || fired.current) event.preventDefault();
      },
    };
  }, [enabled, cancel, delayMs, slopPx]);

  return { bind, consumeClick };
}
