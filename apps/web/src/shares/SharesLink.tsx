import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/** D198/FR-008: "Your shares" in the deck header for everyone who can share (`item.create`). */
export function SharesLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'item.create')) return null;
  return (
    <NavLink href={deckHref(deckSlug, 'shares')} className="header-link">
      Your shares
    </NavLink>
  );
}
