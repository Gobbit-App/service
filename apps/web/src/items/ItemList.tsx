import { useEffect, useRef, type ReactElement } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Category } from '@pb/shared';
import { isNetworkError } from '../api/network-state';
import { itemsQuery } from '../api/queries';
import type { ItemFilter } from '../api/query-keys';
import { Card } from '../cards/Card';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { emptyListCopy } from './empty-copy';

/** P3.3: cursor-paged list; the next page loads when the sentinel nears the viewport. */
export function ItemList({
  deckSlug,
  filter,
  categories,
}: {
  deckSlug: string;
  filter: ItemFilter;
  categories: readonly Category[];
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
            <Card item={item} deckSlug={deckSlug} categories={categories} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div ref={sentinel} className="item-list__more">
          <button
            type="button"
            className="button button--ghost"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
