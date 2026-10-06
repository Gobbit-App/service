import type { ItemListQuery } from '@pb/shared';

/** Which slice of a deck's items a list shows (D65 routes). */
export type ItemFilter =
  | { kind: 'all' }
  | { kind: 'category'; slug: string }
  | { kind: 'favorites' }
  | { kind: 'archived' };

/** Cards per page for the infinite list (P3.3). */
export const ITEM_PAGE_SIZE = 20;

export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  decks: ['decks'] as const,
  deck: (idOrSlug: string) => ['decks', idOrSlug] as const,
  categories: (idOrSlug: string) => ['decks', idOrSlug, 'categories'] as const,
  /** Prefix of every item list; favorite toggles update all of them. */
  itemLists: ['items'] as const,
  items: (deckSlug: string, filter: ItemFilter) => ['items', deckSlug, filter] as const,
  item: (itemId: string) => ['item', itemId] as const,
};

/** Query-string parameters for `GET /decks/{id}/items`. */
export function itemListQuery(
  filter: ItemFilter,
  cursor: string | null,
): Partial<Omit<ItemListQuery, 'limit'>> & { limit: number } {
  const query: Partial<Omit<ItemListQuery, 'limit'>> & { limit: number } = {
    limit: ITEM_PAGE_SIZE,
  };
  if (cursor) query.cursor = cursor;

  switch (filter.kind) {
    case 'category':
      query.category = filter.slug;
      break;
    case 'favorites':
      query.favorite = 'true';
      break;
    case 'archived':
      query.status = 'archived';
      break;
    case 'all':
      break;
  }
  return query;
}

/** True for list keys whose filter is the favorites view. */
export function isFavoritesListKey(key: readonly unknown[]): boolean {
  const filter = key[2] as ItemFilter | undefined;
  return key[0] === 'items' && filter?.kind === 'favorites';
}
