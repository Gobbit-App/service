import type { KeyboardEvent, ReactElement } from 'react';
import { browsePanes, type BrowsePane } from './browse-params';
import type { SwipeStep } from './swipe';
import { useZoneSwipe } from './use-zone-swipe';

const PANE_LABELS: Record<BrowsePane, string> = {
  content: 'Content',
  details: 'Details',
  source: 'Source',
};

/** The neighbouring pane, or null at either end (no wrap). */
export function stepPane(pane: BrowsePane, step: SwipeStep): BrowsePane | null {
  const index = browsePanes.indexOf(pane) + (step === 'next' ? 1 : -1);
  return browsePanes[index] ?? null;
}

export function tabId(pageId: string, pane: BrowsePane): string {
  return `browse-tab-${pageId}-${pane}`;
}

export function panelId(pageId: string): string {
  return `browse-panel-${pageId}`;
}

export interface FooterBandProps {
  /** The page's card id (tab/panel ids); state pages pass their own key. */
  pageId: string;
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  /** Null when there is no next card. */
  onNextCard: (() => void) | null;
  active: boolean;
  /** State pages (loading, empty, offline): everything shown, nothing usable. */
  disabled?: boolean;
}

/** Contract §2 footer band: a horizontal swipe changes the pane; tabs, ‹ › and ↓ do the same. */
export function FooterBand({
  pageId,
  pane,
  onPane,
  onNextCard,
  active,
  disabled = false,
}: FooterBandProps): ReactElement {
  const bind = useZoneSwipe((step: SwipeStep) => {
    const next = stepPane(pane, step);
    if (next) onPane(next);
  }, active && !disabled);
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
    <footer className="browse-band browse-band--footer" {...bind()}>
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
      <div className="browse-band__row">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous view"
          disabled={disabled || !prev}
          onClick={() => prev && onPane(prev)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="browse-dots" aria-hidden="true">
          {browsePanes.map((p) => (
            <span
              key={p}
              className={p === pane ? 'browse-dots__dot is-active' : 'browse-dots__dot'}
            />
          ))}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Next view"
          disabled={disabled || !next}
          onClick={() => next && onPane(next)}
        >
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Next card"
          disabled={disabled || !onNextCard}
          onClick={onNextCard ?? undefined}
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </footer>
  );
}
