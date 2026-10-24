import { can } from '@pb/shared/authz';
import type { Deck } from '@pb/shared';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/** D184: "Deck settings" in the deck header for admins (`deck.update`: owners and maintainers). */
export function DeckSettingsLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'deck.update')) return null;
  return (
    <NavLink href={deckHref(deckSlug, 'settings')} className="header-link" label="Deck settings">
      Deck
    </NavLink>
  );
}
