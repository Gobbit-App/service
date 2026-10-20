import type { ReactElement } from 'react';
import { CategoryMenu } from './CategoryMenu';
import type { CycleEntry } from './category-cycle';
import type { SwipeStep } from './swipe';
import { useZoneSwipe } from './use-zone-swipe';

/** "3 of 10", or just "3" while more pages exist (the total isn't known yet). */
export function positionLabel(index: number, total: number | null): string {
  return total === null ? `${index + 1}` : `${index + 1} of ${total}`;
}

export interface HeaderBandProps {
  cycle: readonly CycleEntry[];
  current: CycleEntry;
  prevCategory: CycleEntry | null;
  nextCategory: CycleEntry | null;
  onCategory: (slug: string) => void;
  onClose: () => void;
  /** Null on the state pages (loading, empty, offline): no position shown. */
  position: { index: number; total: number | null } | null;
  /** Null when there is no previous card. */
  onPrevCard: (() => void) | null;
  /** Only the current page binds the swipe (contract §2). */
  active: boolean;
}

/** Contract §2 header band: a horizontal swipe changes category; the controls do the same. */
export function HeaderBand({
  cycle,
  current,
  prevCategory,
  nextCategory,
  onCategory,
  onClose,
  position,
  onPrevCard,
  active,
}: HeaderBandProps): ReactElement {
  const bind = useZoneSwipe((step: SwipeStep) => {
    const target = step === 'next' ? nextCategory : prevCategory;
    if (target) onCategory(target.slug);
  }, active);

  return (
    <header className="browse-band browse-band--header" {...bind()}>
      <div className="browse-band__row">
        <button type="button" className="icon-button" aria-label="Close browse" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>
        {position && (
          <span className="browse-band__position" aria-hidden="true">
            {positionLabel(position.index, position.total)}
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Previous card"
          disabled={!onPrevCard}
          onClick={onPrevCard ?? undefined}
        >
          <span aria-hidden="true">↑</span>
        </button>
      </div>
      <div className="browse-band__row browse-band__row--category">
        <button
          type="button"
          className="icon-button"
          aria-label={
            prevCategory ? `Previous category: ${prevCategory.name}` : 'Previous category'
          }
          disabled={!prevCategory}
          onClick={() => prevCategory && onCategory(prevCategory.slug)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <CategoryMenu cycle={cycle} current={current} onSelect={onCategory} />
        <button
          type="button"
          className="icon-button"
          aria-label={nextCategory ? `Next category: ${nextCategory.name}` : 'Next category'}
          disabled={!nextCategory}
          onClick={() => nextCategory && onCategory(nextCategory.slug)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </header>
  );
}
