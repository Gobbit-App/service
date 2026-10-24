import { can } from '@pb/shared/authz';
import type { Deck } from '@pb/shared';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/** D188: "Activity" in the deck header, for roles with `event.list` (owners and maintainers). */
export function ActivityLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'event.list')) return null;
  return (
    <NavLink href={deckHref(deckSlug, 'log')} className="header-link">
      Activity
    </NavLink>
  );
}
