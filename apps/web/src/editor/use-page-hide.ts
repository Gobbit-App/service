import { useEffect, useRef } from 'react';

/**
 * D204 / FR-008: runs `callback` when the page may be going away — hidden (app switch, tab
 * switch, the last reliable event on mobile), `pagehide` and `beforeunload`.
 */
export function usePageHide(callback: () => void): void {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });

  useEffect(() => {
    const run = () => ref.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', run);
    window.addEventListener('beforeunload', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', run);
      window.removeEventListener('beforeunload', run);
    };
  }, []);
}
