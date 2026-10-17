import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { NavLink } from '../ui/NavLink';

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
    <NavLink
      href={`/share?deck=${encodeURIComponent(deckSlug)}`}
      className="button button--ghost paste-link"
    >
      Paste
    </NavLink>
  );
}
