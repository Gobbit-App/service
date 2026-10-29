import { can } from '@gobbit/shared/authz';
import type { Deck } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { IconLink } from '../ui/buttons/IconLink';

/** D184: "Deck settings" in the deck header for admins (`deck.update`: owners and maintainers). */
export function DeckSettingsLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'deck.update')) return null;
  return <IconLink href={deckHref(deckSlug, 'settings')} icon="list" label="Deck settings" />;
}
