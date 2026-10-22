import { useEffect, useState, type RefObject } from 'react';

/** The card column's widest content box: `.browse-page__content` max width minus padding. */
const COLUMN_MAX_PX = 640;
const COLUMN_PADDING_PX = 32;

/** A width change smaller than this keeps the last value, so `sizes` doesn't flap (D161). */
export const WIDTH_HYSTERESIS_PX = 8;

/** The pre-measurement estimate of an image's `sizes`, e.g. `328px` on a 360 px phone (009). */
export function imageSizesFor(viewportWidth: number): string {
  const width = Math.min(viewportWidth, COLUMN_MAX_PX) - COLUMN_PADDING_PX;
  return `${Math.max(Math.round(width), 1)}px`;
}

type WidthCallback = (width: number) => void;

const callbacks = new WeakMap<Element, WidthCallback>();
let observer: ResizeObserver | null = null;

/** One observer for every measured element; `null` where `ResizeObserver` doesn't exist. */
function sharedObserver(): ResizeObserver | null {
  if (observer) return observer;
  if (typeof ResizeObserver === 'undefined') return null;
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry.contentRect.width);
  });
  return observer;
}

/** Keeps `previous` unless `next` moved by at least the hysteresis; ignores hidden (0) widths. */
export function nextWidth(previous: number | null, next: number): number | null {
  const rounded = Math.round(next);
  if (rounded <= 0) return previous;
  if (previous !== null && Math.abs(rounded - previous) < WIDTH_HYSTERESIS_PX) return previous;
  return rounded;
}

/** The element's content width in whole px, or `null` until it has been measured. */
export function useElementWidth(ref: RefObject<Element | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    const shared = sharedObserver();
    if (!element || !shared) return;
    callbacks.set(element, (next) => setWidth((previous) => nextWidth(previous, next)));
    shared.observe(element);
    return () => {
      callbacks.delete(element);
      shared.unobserve(element);
    };
  }, [ref]);

  return width;
}
