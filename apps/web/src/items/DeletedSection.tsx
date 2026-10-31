import { useInfiniteQuery } from '@tanstack/react-query';
import type { Deck } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { itemsQuery } from '../api/queries';
import { CardActionBar } from '../cards/CardActionBar';
import { daysLeft, daysLeftLabel } from './days-left';
import { Button } from '../ui/buttons/Button';

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
            <CardActionBar item={item} deckSlug={deckSlug} role={role} />
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          icon="arrow-down"
          label={query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          variant="ghost"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      )}
    </section>
  );
}
