import { useEffect, useRef, type RefObject } from 'react';
import { prefetchMediaModule, type MediaModuleName } from './load-media-module';

/** How long a media card stays on screen before its chunk is fetched while idle (D400). */
export const IDLE_PREFETCH_DELAY_MS = 1000;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * D400: the chunk a card will need is fetched on the first sign of intent (the handlers to
 * spread on the facade) or once the card has been on screen for a second, in idle time, unless
 * the connection saves data.
 */
export function useIntentPrefetch(name: MediaModuleName, target: RefObject<HTMLElement | null>) {
  const done = useRef(false);

  useEffect(() => {
    const node = target.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      clearTimeout(timer);
      if (!visible || done.current) return;
      timer = setTimeout(() => {
        const w = window as IdleWindow;
        const run = () => {
          done.current = true;
          prefetchMediaModule(name, { idle: true });
        };
        if (w.requestIdleCallback) w.requestIdleCallback(run);
        else run();
      }, IDLE_PREFETCH_DELAY_MS);
    });
    observer.observe(node);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [name, target]);

  const intent = () => {
    if (done.current) return;
    done.current = true;
    prefetchMediaModule(name);
  };
  return { onPointerDown: intent, onFocus: intent, onMouseEnter: intent };
}
