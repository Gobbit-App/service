import { useEffect } from 'react';
import { browseKeyAction, type BrowseKeyAction } from './browse-keys';

/**
 * Listens on the document for the Browse keys in `actions` (contract §3). It re-subscribes
 * when `actions` changes, so callers memoize it. Handled keys get `preventDefault()`, so the
 * snap container doesn't also scroll natively.
 */
export function useBrowseKeys(
  actions: Partial<Record<BrowseKeyAction, () => void>>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = browseKeyAction(event);
      const run = action ? actions[action] : undefined;
      if (!run) return;
      event.preventDefault();
      run();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions, enabled]);
}
