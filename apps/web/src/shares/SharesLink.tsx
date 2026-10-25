import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/**
 * D198/FR-008: "Your shares" in the deck actions, beside Paste, for everyone who can share
 * (`item.create`); the header has no room for it at 360 px.
 */
export function SharesLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'item.create')) return null;
  return (
    <NavLink href={deckHref(deckSlug, 'shares')} className="button button--ghost shares-link">
      Your shares
    </NavLink>
  );
}
