import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement } from 'react';
import { deckHref } from '../ui/chip-order';
import { ButtonLink } from '../ui/buttons/ButtonLink';

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
    <ButtonLink
      href={deckHref(deckSlug, 'import')}
      icon="file-import"
      label="Import notes"
      variant="ghost"
      className="import-link"
    />
  );
}
