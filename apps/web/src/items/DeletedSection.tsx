import { useInfiniteQuery } from '@tanstack/react-query';
import type { Deck } from '@pb/shared';
import type { ReactElement } from 'react';
import { itemsQuery } from '../api/queries';
import { CardActions } from './CardActions';
import { daysLeft, daysLeftLabel } from './days-left';

/**
 * D132: Recently deleted, under Archived, for `item.delete` roles. Newest deleted first,
 * with the days left in the 30-day window and Undelete.
 */
export function DeletedSection({
  deckSlug,
  role,
}: {
  deckSlug: string;
  role: Deck['role'];
}): ReactElement | null {
  const query = useInfiniteQuery(itemsQuery(deckSlug, { kind: 'deleted' }));
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (query.isPending || items.length === 0) return null;

  return (
    <section className="deleted-section" aria-labelledby="deleted-section-title">
      <h2 id="deleted-section-title">Recently deleted</h2>
      <ul className="deleted-section__list">
        {items.map((item) => (
          <li key={item.id} className="deleted-section__item">
            <strong>{item.title}</strong>
            {item.deletedAt && (
              <div className="deleted-section__meta">{daysLeftLabel(daysLeft(item.deletedAt))}</div>
            )}
            <CardActions item={item} deckSlug={deckSlug} role={role} />
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <button
          type="button"
          className="button button--ghost"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
