import { useQuery } from '@tanstack/react-query';
import type { Deck, Item } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { meQuery } from '../api/queries';
import { currentReturnPath } from '../app/return-path';
import { IconLink } from '../ui/buttons/IconLink';
import { canEditItem, editHref } from './can-edit-item';

/** The card's own page needs no `?back=`: the editor goes there by default. */
function openerBack(itemId: string): string | null {
  const back = currentReturnPath();
  return back === `/i/${encodeURIComponent(itemId)}` ? null : back;
}

/**
 * R8: the pencil "Edit" link, only for roles that may change this card (024: in the card bar).
 * D320: it carries the page it sits on (Browse at this card, a list…) so the editor returns there.
 */
export function EditLink({
  item,
  role,
}: {
  item: Item;
  role: Deck['role'] | undefined;
}): ReactElement | null {
  const me = useQuery({ ...meQuery(), enabled: item.status === 'proposed' });
  if (!canEditItem(item, role, me.data?.user.id)) return null;
  return (
    <IconLink href={editHref(item.id, { back: openerBack(item.id) })} icon="edit" label="Edit" />
  );
}
