import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/** D189: "Import" opens the import screen; owners and maintainers (`item.publish`). */
export function ImportLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'item.publish')) return null;
  return (
    <NavLink
      href={deckHref(deckSlug, 'import')}
      className="button button--ghost import-link"
      label="Import notes"
    >
      Import
    </NavLink>
  );
}
