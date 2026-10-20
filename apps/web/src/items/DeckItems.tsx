import { useQuery } from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import type { ReactElement, ReactNode } from 'react';
import { categoriesQuery, deckQuery } from '../api/queries';
import { EditLink } from '../cards/EditLink';
import type { ItemFilter } from '../api/query-keys';
import { ItemList } from './ItemList';

/**
 * A deck list view; categories come from the layout's (cached) query for the card chips.
 * Without `renderActions`, each card gets the role-gated Edit link (R8).
 */
export function DeckItems({
  slug,
  filter,
  renderActions,
}: {
  slug: string;
  filter: ItemFilter;
  renderActions?: (item: Item) => ReactNode;
}): ReactElement {
  const categories = useQuery(categoriesQuery(slug));
  const role = useQuery(deckQuery(slug)).data?.role;
  return (
    <ItemList
      deckSlug={slug}
      filter={filter}
      categories={categories.data ?? []}
      renderActions={renderActions ?? ((item) => <EditLink item={item} role={role} row />)}
    />
  );
}
