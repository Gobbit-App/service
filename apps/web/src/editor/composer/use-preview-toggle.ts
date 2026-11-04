import { useCallback, useEffect, useRef, useState } from 'react';

type Saved = { scrollY: number; focus: HTMLElement | null };

export type PreviewToggle = {
  open: boolean;
  toggle: () => void;
  /** Leave the preview; returns whether it was open (Escape uses this to stop there). */
  close: () => boolean;
};

/**
 * D309 (039): the narrow-screen Preview toggle. Opening remembers the window scroll and the
 * focused element; leaving (toggle or Escape) restores both once the canvas is shown again.
 */
export function usePreviewToggle(): PreviewToggle {
  const [open, setOpen] = useState(false);
  const saved = useRef<Saved | null>(null);
  const restore = useRef(false);
  // Mirrored in a ref (set by show/close) so `close` keeps one identity for effects.
  const openRef = useRef(open);

  const show = useCallback(() => {
    const active = document.activeElement;
    saved.current = {
      scrollY: window.scrollY,
      focus: active instanceof HTMLElement && active !== document.body ? active : null,
    };
    openRef.current = true;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (!openRef.current) return false;
    openRef.current = false;
    restore.current = true;
    setOpen(false);
    return true;
  }, []);

  const toggle = useCallback(() => {
    if (openRef.current) close();
    else show();
  }, [close, show]);

  useEffect(() => {
    if (open || !restore.current) return;
    restore.current = false;
    const { scrollY = 0, focus = null } = saved.current ?? {};
    saved.current = null;
    window.scrollTo({ top: scrollY });
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  }, [open]);

  return { open, toggle, close };
}
