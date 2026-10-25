import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { reviewCountQuery } from '../api/review';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';

/**
 * D107: "Review · N" in the deck header. D198/FR-007: always shown to publishers (just "Review"
 * while the queue is empty) so the way into review never disappears.
 */
export function ReviewPill({ deckSlug }: { deckSlug: string }): ReactElement {
  const count = useQuery(reviewCountQuery(deckSlug)).data?.count ?? 0;
  return (
    <NavLink href={deckHref(deckSlug, 'review')} className="review-pill">
      {count > 0 ? `Review · ${count}` : 'Review'}
    </NavLink>
  );
}
