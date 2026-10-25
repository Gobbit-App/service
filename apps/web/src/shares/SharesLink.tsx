import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { ButtonLink } from '../ui/buttons/ButtonLink';

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
    <ButtonLink
      href={deckHref(deckSlug, 'shares')}
      icon="send"
      label="Your shares"
      variant="ghost"
      className="shares-link"
    />
  );
}
