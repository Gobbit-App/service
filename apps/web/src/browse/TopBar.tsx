import type { ReactElement } from 'react';
import { IconButton } from '../ui/buttons/IconButton';
import type { CycleEntry } from './category-cycle';
import { CategoryRail } from './CategoryRail';

/** Where the reader is in the category: `total` is null while more pages exist. */
export interface BrowsePosition {
  index: number;
  total: number | null;
  /** Cards loaded so far (stands in for the total in the progress bar). */
  loaded: number;
}

/** "3 / 25", or just "3" while the total isn't known. */
export function counterLabel({ index, total }: Pick<BrowsePosition, 'index' | 'total'>): string {
  return total === null ? `${index + 1}` : `${index + 1} / ${total}`;
}

/** "3 of 25" (the live region), or "3" while the total isn't known. */
export function positionLabel(index: number, total: number | null): string {
  return total === null ? `${index + 1}` : `${index + 1} of ${total}`;
}

/** 0–1 fill of the progress bar; while the total is unknown there is always "one more". */
export function progressFraction({ index, total, loaded }: BrowsePosition): number {
  const of = total ?? loaded + 1;
  return of <= 0 ? 0 : Math.min(1, (index + 1) / of);
}

/**
 * D247/D249: the compact translucent bar: close, the category rail, the plain position counter
 * (`aria-hidden`; the stack announces "Card n of N") and a thin progress bar.
 */
export function TopBar({
  cycle,
  current,
  onCategory,
  onClose,
  position,
}: {
  cycle: readonly CycleEntry[];
  current: string;
  onCategory: (slug: string) => void;
  onClose: () => void;
  /** Null on the state pages (loading, empty, offline). */
  position: BrowsePosition | null;
}): ReactElement {
  return (
    <header className="browse-top">
      <div className="browse-top__row">
        <IconButton icon="close" label="Close browse" onClick={onClose} />
        <CategoryRail cycle={cycle} current={current} onSelect={onCategory} />
        <span className="browse-top__counter" aria-hidden="true">
          {position ? counterLabel(position) : ''}
        </span>
      </div>
      <div className="browse-top__progress" aria-hidden="true">
        <span
          className="browse-top__progress-fill"
          style={{ transform: `scaleX(${position ? progressFraction(position) : 0})` }}
        />
      </div>
    </header>
  );
}
