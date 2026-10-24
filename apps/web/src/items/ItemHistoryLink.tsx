import { can } from '@pb/shared/authz';
import type { Deck } from '@pb/shared';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/** D188: "History" on the card page — the deck log narrowed to this card, for `event.list` roles. */
export function ItemHistoryLink({
  deckSlug,
  itemId,
  role,
}: {
  deckSlug: string;
  itemId: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'event.list')) return null;
  return (
    <NavLink
      href={`${deckHref(deckSlug, 'log')}?item=${encodeURIComponent(itemId)}`}
      className="button button--ghost"
    >
      History
    </NavLink>
  );
}
