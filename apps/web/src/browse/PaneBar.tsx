import type { KeyboardEvent, ReactElement } from 'react';
import { browsePanes, type BrowsePane } from './browse-params';
import { stepPane, usePaneSwipe } from './use-pane-swipe';

const PANE_LABELS: Record<BrowsePane, string> = {
  content: 'Content',
  details: 'Details',
  source: 'Source',
};

export function tabId(pageId: string, pane: BrowsePane): string {
  return `browse-tab-${pageId}-${pane}`;
}

export function panelId(pageId: string): string {
  return `browse-panel-${pageId}`;
}

export interface PaneBarProps {
  /** The page's card id (tab/panel ids); state pages pass their own key. */
  pageId: string;
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  active: boolean;
  /** State pages (loading, empty, offline): everything shown, nothing usable. */
  disabled?: boolean;
}

/**
 * Contract §2 pane zone, D218: the dock's top row. A horizontal swipe on it (or on the card,
 * `usePaneSwipe`) changes the pane; the tabs do the same (D215: no arrows).
 */
export function PaneBar({
  pageId,
  pane,
  onPane,
  active,
  disabled = false,
}: PaneBarProps): ReactElement {
  const bind = usePaneSwipe(pane, onPane, active && !disabled);
  const prev = stepPane(pane, 'prev');
  const next = stepPane(pane, 'next');

  const select = (target: BrowsePane) => {
    onPane(target);
    document.getElementById(tabId(pageId, target))?.focus();
  };

  // APG tabs, manual activation is not needed: a pane switch is cheap, so arrows select.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, BrowsePane | null> = {
      ArrowRight: next,
      ArrowLeft: prev,
      Home: browsePanes[0],
      End: browsePanes[browsePanes.length - 1],
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const target = moves[event.key];
    if (target) select(target);
  };

  return (
    <div className="browse-band browse-band--panes" {...bind()}>
      <div className="browse-band__row">
        <div className="browse-tabs" role="tablist" aria-label="Card view" onKeyDown={onTabKeyDown}>
          {browsePanes.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              id={tabId(pageId, p)}
              className="browse-tabs__tab"
              aria-selected={p === pane}
              aria-controls={p === pane ? panelId(pageId) : undefined}
              tabIndex={p === pane ? 0 : -1}
              disabled={disabled}
              onClick={() => onPane(p)}
            >
              {PANE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <span className="browse-dots" aria-hidden="true">
        {browsePanes.map((p) => (
          <span
            key={p}
            className={p === pane ? 'browse-dots__dot is-active' : 'browse-dots__dot'}
          />
        ))}
      </span>
    </div>
  );
}
