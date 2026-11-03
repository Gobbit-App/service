import { useEffect, useRef } from 'react';
import { dismissToast, showToast } from '../../ui/toast-store';

export const CLEAR_UNDO_LABEL = 'Undo';

/**
 * D270: Clear for a payload editor. Replaces the payload with `blank()` and offers the app toast
 * with Undo, which puts the payload from before the Clear back. The toast goes away with the
 * fields (type switch, leaving the editor), so Undo never lands on another card or type.
 */
export function useClearWithUndo<P>(
  payload: P,
  onChange: (next: P) => void,
  blank: () => P,
  message: string,
): () => void {
  const toastId = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (toastId.current !== null) dismissToast(toastId.current);
    },
    [],
  );

  return () => {
    const previous = payload;
    onChange(blank());
    toastId.current = showToast({
      message,
      action: { label: CLEAR_UNDO_LABEL, onAction: () => onChange(previous) },
    });
  };
}
