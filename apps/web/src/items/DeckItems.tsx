import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { categoriesQuery } from '../api/queries';
import type { ItemFilter } from '../api/query-keys';
import { ItemList } from './ItemList';

/** A deck list view; categories come from the layout's (cached) query for the card chips. */
export function DeckItems({ slug, filter }: { slug: string; filter: ItemFilter }): ReactElement {
  const categories = useQuery(categoriesQuery(slug));
  return <ItemList deckSlug={slug} filter={filter} categories={categories.data ?? []} />;
}
