import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Item } from '@pb/shared';
import { itemsQuery } from '../api/queries';
import type { ItemFilter } from '../api/query-keys';

/** Data-model §2: a deep-linked card is looked for in at most this many pages. */
export const SEEK_MAX_PAGES = 5;
/** The next page loads once the current card is this close to the last loaded one. */
export const PREFETCH_AHEAD = 3;

/**
 * Browse's cards: the list's own infinite query (same key, same persisted cache), plus the
 * deep-link seek. `notFound` means `targetId` is not in the first `SEEK_MAX_PAGES` pages.
 */
export function useBrowseItems(deckSlug: string, filter: ItemFilter, targetId: string | undefined) {
  const query = useInfiniteQuery(itemsQuery(deckSlug, filter));
  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  const items = useMemo<Item[]>(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const pageCount = data?.pages.length ?? 0;
  const found = !targetId || items.some((item) => item.id === targetId);
  const canSeek = data !== undefined && !found && hasNextPage && pageCount < SEEK_MAX_PAGES;

  useEffect(() => {
    if (canSeek && !isFetchingNextPage && !isError) void fetchNextPage();
    // `pageCount` re-runs the seek when a fast page lands within one render.
  }, [canSeek, pageCount, isFetchingNextPage, isError, fetchNextPage]);

  return {
    query,
    items,
    /** Still paging towards a deep-linked card. */
    seeking: canSeek && !isError,
    notFound: data !== undefined && !found && (!canSeek || isError),
    /** Known only once the last page is loaded ("n of N"); null shows just "n". */
    total: hasNextPage ? null : items.length,
  };
}

/** FR-016: keep a page ahead of the reader so the next cards are there before they're needed. */
export function usePrefetchAhead({
  currentIndex,
  loaded,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  currentIndex: number;
  loaded: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}): void {
  const nearEnd = currentIndex >= 0 && currentIndex >= loaded - PREFETCH_AHEAD;
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [nearEnd, loaded, hasNextPage, isFetchingNextPage, fetchNextPage]);
}
