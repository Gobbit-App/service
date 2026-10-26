import type { ReactElement } from 'react';
import { IconButton } from '../ui/buttons/IconButton';
import { CategoryMenu } from './CategoryMenu';
import type { CycleEntry } from './category-cycle';
import type { SwipeStep } from './swipe';
import { PositionMenu } from './PositionMenu';
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
  /** Null when there is no next card. */
  onNextCard: (() => void) | null;
  /** Only the current page binds the swipe (contract §2). */
  active: boolean;
}

/**
 * Contract §2 header band: a horizontal swipe changes category. D215: no arrow buttons — the
 * category menu and the position menu give the same moves without a swipe.
 */
export function HeaderBand({
  cycle,
  current,
  prevCategory,
  nextCategory,
  onCategory,
  onClose,
  position,
  onPrevCard,
  onNextCard,
  active,
}: HeaderBandProps): ReactElement {
  const bind = useZoneSwipe((step: SwipeStep) => {
    const target = step === 'next' ? nextCategory : prevCategory;
    if (target) onCategory(target.slug);
  }, active);

  return (
    <header className="browse-band browse-band--header" {...bind()}>
      <div className="browse-band__row">
        <IconButton icon="close" label="Close browse" onClick={onClose} />
        {position && (
          <PositionMenu
            index={position.index}
            total={position.total}
            onPrevCard={onPrevCard}
            onNextCard={onNextCard}
          />
        )}
      </div>
      <div className="browse-band__row browse-band__row--category">
        <CategoryMenu cycle={cycle} current={current} onSelect={onCategory} />
      </div>
    </header>
  );
}
