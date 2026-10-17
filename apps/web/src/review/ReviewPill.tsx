import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { reviewCountQuery } from '../api/review';
import { NavLink } from '../ui/NavLink';

/** D107: "Review · N" in the deck header; hidden while the queue is empty. */
export function ReviewPill({ deckSlug }: { deckSlug: string }): ReactElement | null {
  const count = useQuery(reviewCountQuery(deckSlug)).data?.count ?? 0;
  if (count === 0) return null;
  return (
    <NavLink href={`/d/${encodeURIComponent(deckSlug)}/review`} className="review-pill">
      Review · {count}
    </NavLink>
  );
}
