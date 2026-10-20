import { useQuery } from '@tanstack/react-query';
import type { Deck, Item } from '@pb/shared';
import type { ReactElement } from 'react';
import { meQuery } from '../api/queries';
import { NavLink } from '../ui/NavLink';
import { canEditItem, editHref } from './can-edit-item';

/**
 * R8: the "Edit" link, only for roles that may change this card. `row` wraps it in the
 * card-actions row for lists that have no other actions.
 */
export function EditLink({
  item,
  role,
  row = false,
}: {
  item: Item;
  role: Deck['role'] | undefined;
  row?: boolean;
}): ReactElement | null {
  const me = useQuery({ ...meQuery(), enabled: item.status === 'proposed' });
  if (!canEditItem(item, role, me.data?.user.id)) return null;

  const link = (
    <NavLink href={editHref(item.id)} className="button button--ghost">
      Edit
    </NavLink>
  );
  return row ? <div className="card-actions">{link}</div> : link;
}
