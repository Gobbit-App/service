import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { ButtonLink } from '../ui/buttons/ButtonLink';

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
    <ButtonLink
      href={deckHref(deckSlug, 'new')}
      icon="plus"
      label="Add card"
      className="add-card-link"
    />
  );
}
