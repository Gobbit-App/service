import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Category, Item } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import { itemsQuery } from '../api/queries';
import type { ItemFilter } from '../api/query-keys';
import { categoryFromFilterKey, filterKey, listHref } from '../browse/browse-params';
import {
  browseReturnRedirect,
  clearBrowseReturn,
  historyIndex,
  readBrowseReturn,
} from '../browse/browse-return';
import { Card } from '../cards/Card';
import { useNavigateHref } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { emptyListCopy } from './empty-copy';
import { Button } from '../ui/buttons/Button';

/**
 * Data-model §3: back from Browse, scroll to the card Browse was on (once, then forget it). It
 * runs a frame after the list renders so it wins over the router's pathname-keyed restore (D65).
 */
function useReturnFromBrowse(deckSlug: string, filter: ItemFilter, ready: boolean): void {
  const key = filterKey(filter);
  const navigateHref = useNavigateHref();

  // FR-005: back after a category change in Browse lands here, on the list it was opened from.
  useEffect(() => {
    const target = browseReturnRedirect(deckSlug, key, historyIndex(window.history.state));
    const c = target === null ? null : categoryFromFilterKey(target);
    if (c !== null) navigateHref(listHref(deckSlug, c), { replace: true });
  }, [deckSlug, key, navigateHref]);

  useEffect(() => {
    if (!ready) return;
    const entry = readBrowseReturn(deckSlug, key);
    if (!entry) return;
    const frame = requestAnimationFrame(() => {
      // Cleared here, not before: a cancelled frame (Strict Mode re-run) must not lose it.
      clearBrowseReturn();
      const title = document.getElementById(`card-title-${entry.itemId}`);
      title?.closest('article')?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [deckSlug, key, ready]);
}

/** P3.3: cursor-paged list; the next page loads when the sentinel nears the viewport. */
export function ItemList({
  deckSlug,
  filter,
  categories,
  renderActions,
}: {
  deckSlug: string;
  filter: ItemFilter;
  categories: readonly Category[];
  /** Each card's action bar (D213); without it, cards get Favorite + Share. */
  renderActions?: (item: Item) => ReactNode;
}): ReactElement {
  const query = useInfiniteQuery(itemsQuery(deckSlug, filter));
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useReturnFromBrowse(deckSlug, filter, (query.data?.pages.length ?? 0) > 0);

  if (query.isPending) return <LoadingState label="Loading cards…" />;

  if (query.isError && !query.data) {
    return (
      <ErrorState
        message={
          isNetworkError(query.error)
            ? "You're offline and these cards aren't saved on this device yet."
            : 'Something went wrong loading these cards.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  if (items.length === 0) {
    const copy = emptyListCopy(filter);
    return <EmptyState title={copy.title}>{copy.body}</EmptyState>;
  }

  return (
    <div className="item-list">
      <ul className="item-list__items">
        {items.map((item) => (
          <li key={item.id}>
            <Card
              item={item}
              deckSlug={deckSlug}
              categories={categories}
              actions={renderActions?.(item)}
            />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div ref={sentinel} className="item-list__more">
          <Button
            icon="arrow-down"
            label={isFetchingNextPage ? 'Loading…' : 'Load more'}
            variant="ghost"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          />
        </div>
      )}
    </div>
  );
}
