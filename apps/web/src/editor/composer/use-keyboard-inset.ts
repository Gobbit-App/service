import { useEffect, useState, type RefObject } from 'react';

/** Above this many covered pixels the on-screen keyboard counts as open (D305). */
export const KEYBOARD_OPEN_FROM = 120;

type ViewportBox = { height: number; offsetTop: number };

/** The height the on-screen keyboard covers at the bottom of the layout viewport (never < 0). */
export function keyboardInset(innerHeight: number, viewport: ViewportBox | null): number {
  if (!viewport) return 0;
  return Math.max(0, Math.round(innerHeight - (viewport.height + viewport.offsetTop)));
}

/**
 * D305 (039): track the on-screen keyboard through `visualViewport` (iOS Safari doesn't resize the
 * layout viewport for it). Writes `--kb-inset` and `data-keyboard="open"` on `rootRef`, and
 * returns whether the keyboard is open. Without `visualViewport` the inset stays 0.
 */
export function useKeyboardInset(rootRef: RefObject<HTMLElement | null>): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;
    const update = () => {
      const inset = keyboardInset(window.innerHeight, viewport);
      const isOpen = inset > KEYBOARD_OPEN_FROM;
      root.style.setProperty('--kb-inset', `${inset}px`);
      if (isOpen) root.dataset['keyboard'] = 'open';
      else delete root.dataset['keyboard'];
      setOpen(isOpen);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--kb-inset');
      delete root.dataset['keyboard'];
    };
  }, [rootRef]);

  return open;
}
