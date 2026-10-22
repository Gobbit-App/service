import type { ItemListQuery } from '@pb/shared';

/** First segment of every search query key. */
export const SEARCH_KEY = 'search';

/** First segment of every review-queue key (D107: never persisted, like search). */
export const REVIEW_KEY = 'review';

/** Which slice of a deck's items a list shows (D65 routes). */
export type ItemFilter =
  | { kind: 'all' }
  | { kind: 'category'; slug: string }
  | { kind: 'favorites' }
  | { kind: 'archived' }
  /** D165: flagged link cards ("Links to check", `item.update` roles). */
  | { kind: 'links' }
  /** D132: Recently deleted (item.delete roles); never shown as a chip. */
  | { kind: 'deleted' };

/** Cards per page for the infinite list (P3.3). */
export const ITEM_PAGE_SIZE = 20;

export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  ingestTokens: ['me', 'ingest-tokens'] as const,
  decks: ['decks'] as const,
  deck: (idOrSlug: string) => ['decks', idOrSlug] as const,
  categories: (idOrSlug: string) => ['decks', idOrSlug, 'categories'] as const,
  /** Prefix of every item list; favorite toggles update all of them. */
  itemLists: ['items'] as const,
  items: (deckSlug: string, filter: ItemFilter) => ['items', deckSlug, filter] as const,
  /** Every list of one deck (lifecycle actions invalidate them all). */
  deckItemLists: (deckSlug: string) => ['items', deckSlug] as const,
  item: (itemId: string) => ['item', itemId] as const,
  /** D79: never persisted (see `persist.ts`). */
  search: (deckSlug: string, q: string) => [SEARCH_KEY, deckSlug, q] as const,
  /** D107: never persisted (see `persist.ts`). */
  review: (deckSlug: string) => [REVIEW_KEY, deckSlug] as const,
  reviewCount: (deckSlug: string) => [REVIEW_KEY, deckSlug, 'count'] as const,
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
    case 'deleted':
      query.status = 'deleted';
      break;
    case 'links':
      query.flag = 'link';
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
