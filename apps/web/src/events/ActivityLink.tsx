import { can } from '@gobbit/shared/authz';
import type { Deck } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { IconLink } from '../ui/buttons/IconLink';

/** D188: "Activity" in the deck header, for roles with `event.list` (owners and maintainers). */
export function ActivityLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'event.list')) return null;
  return <IconLink href={deckHref(deckSlug, 'log')} icon="history" label="Activity" />;
}
