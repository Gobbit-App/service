import { browsePanes, type BrowsePane } from './browse-params';
import type { SwipeStep } from './swipe';
import { ownsSidewaysDrag } from './swipe-target';
import { useZoneSwipe } from './use-zone-swipe';

/** The neighbouring pane, or null at either end (no wrap). */
export function stepPane(pane: BrowsePane, step: SwipeStep): BrowsePane | null {
  const index = browsePanes.indexOf(pane) + (step === 'next' ? 1 : -1);
  return browsePanes[index] ?? null;
}

/**
 * D218: a horizontal swipe on the pane bar or anywhere on the card changes the pane (leftward
 * = next). Drags that start on text entry or a horizontal scroller (a wide table) are theirs.
 */
export function usePaneSwipe(pane: BrowsePane, onPane: (pane: BrowsePane) => void, enabled = true) {
  return useZoneSwipe(
    (step) => {
      const next = stepPane(pane, step);
      if (next) onPane(next);
    },
    enabled,
    ownsSidewaysDrag,
  );
}
