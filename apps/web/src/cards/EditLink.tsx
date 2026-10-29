import { useQuery } from '@tanstack/react-query';
import type { Deck, Item } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { meQuery } from '../api/queries';
import { IconLink } from '../ui/buttons/IconLink';
import { canEditItem, editHref } from './can-edit-item';

/** R8: the pencil "Edit" link, only for roles that may change this card (024: in the card bar). */
export function EditLink({
  item,
  role,
}: {
  item: Item;
  role: Deck['role'] | undefined;
}): ReactElement | null {
  const me = useQuery({ ...meQuery(), enabled: item.status === 'proposed' });
  if (!canEditItem(item, role, me.data?.user.id)) return null;
  return <IconLink href={editHref(item.id)} icon="edit" label="Edit" />;
}
