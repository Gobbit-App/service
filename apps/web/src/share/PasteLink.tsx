import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import type { ReactElement } from 'react';
import { ButtonLink } from '../ui/buttons/ButtonLink';

/** D108: "Paste" opens the share screen preset to this deck; same roles as "Add card". */
export function PasteLink({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  if (!can(role, 'item.create')) return null;
  return (
    <ButtonLink
      href={`/share?deck=${encodeURIComponent(deckSlug)}`}
      icon="clipboard"
      label="Paste"
      variant="ghost"
      className="paste-link"
    />
  );
}
