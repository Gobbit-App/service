import type { ReactElement } from 'react';
import { MoreMenu } from '../ui/MoreMenu';

export interface PositionMenuProps {
  index: number;
  /** Null while more pages exist (the total isn't known yet). */
  total: number | null;
  /** Null when there is no previous card. */
  onPrevCard: (() => void) | null;
  /** Null when there is no next card. */
  onNextCard: (() => void) | null;
}

/**
 * D215: the card position ("3 / 12") is a menu button named "Card 3 of 12" offering
 * Previous card / Next card, so screen-reader, switch and keyboard users keep the card
 * moves the removed arrow buttons used to give.
 */
export function PositionMenu({
  index,
  total,
  onPrevCard,
  onNextCard,
}: PositionMenuProps): ReactElement {
  const n = index + 1;
  const label = total === null ? `Card ${n}` : `Card ${n} of ${total}`;
  return (
    <MoreMenu
      label={label}
      className="browse-band__position"
      trigger={<span aria-hidden="true">{total === null ? `${n}` : `${n} / ${total}`}</span>}
      actions={[
        {
          key: 'prev',
          label: 'Previous card',
          icon: 'arrow-up',
          onSelect: onPrevCard ?? undefined,
          disabledReason: onPrevCard ? null : 'this is the first card',
        },
        {
          key: 'next',
          label: 'Next card',
          icon: 'arrow-down',
          onSelect: onNextCard ?? undefined,
          disabledReason: onNextCard ? null : 'this is the last card',
        },
      ]}
    />
  );
}
