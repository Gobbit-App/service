import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { deckQuery } from '../api/queries';
import { CardActionBar } from '../cards/CardActionBar';
import { CardBar, ReaderActions } from '../cards/CardBar';
import { IconButton } from '../ui/buttons/IconButton';

const FIRST_CARD = 'this is the first card';
const LAST_CARD = 'this is the last card';

/**
 * D249: the floating dock: Previous card · the current card's actions (D213, as in the list)
 * · Next card. The moves are always visible, so no swipe is ever required.
 */
export function BrowseDock({
  item,
  deckSlug,
  onPrevCard,
  onNextCard,
}: {
  item: Item;
  deckSlug: string;
  /** Null when there is no previous card. */
  onPrevCard: (() => void) | null;
  /** Null when there is nothing after this card. */
  onNextCard: (() => void) | null;
}): ReactElement {
  const role = useQuery(deckQuery(deckSlug)).data?.role;
  return (
    <div className="browse-dock">
      <IconButton
        icon="back"
        label="Previous card"
        className="browse-dock__step"
        disabledReason={onPrevCard ? null : FIRST_CARD}
        onClick={() => onPrevCard?.()}
      />
      <div className="browse-dock__actions">
        {role ? (
          <CardActionBar item={item} deckSlug={deckSlug} role={role} />
        ) : (
          <CardBar>
            <ReaderActions item={item} />
          </CardBar>
        )}
      </div>
      <IconButton
        icon="forward"
        label="Next card"
        className="browse-dock__step"
        disabledReason={onNextCard ? null : LAST_CARD}
        onClick={() => onNextCard?.()}
      />
    </div>
  );
}
