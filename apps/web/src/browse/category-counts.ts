import type { QueryClient } from '@tanstack/react-query';
import { itemsQuery } from '../api/queries';
import { filterFromCategory } from './browse-params';

/**
 * Data-model §4: the number of cards in category `c`, read from the list query's cache only
 * (no request). Known once the last loaded page has no `nextCursor`; otherwise null, and the
 * banner and the list show just the name.
 */
export function knownCategoryTotal(
  queryClient: QueryClient,
  deckSlug: string,
  c: string,
): number | null {
  const data = queryClient.getQueryData(itemsQuery(deckSlug, filterFromCategory(c)).queryKey);
  const pages = data?.pages;
  if (!pages || pages.length === 0) return null;
  if (pages[pages.length - 1].nextCursor) return null;
  return pages.reduce((sum, page) => sum + page.data.length, 0);
}

/** "12 cards", "1 card". */
export function cardCountLabel(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}
