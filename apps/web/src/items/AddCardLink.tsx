import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { NavLink } from '../ui/NavLink';

/** "Add card" entry in the deck layout; shown only to roles that may create items. */
export function AddCardLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'item.create')) return null;
  return (
    <NavLink href={`/d/${encodeURIComponent(deckSlug)}/new`} className="button add-card-link">
      Add card
    </NavLink>
  );
}
