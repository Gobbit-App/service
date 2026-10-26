import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { reviewCountQuery } from '../api/review';
import { deckHref } from '../ui/chip-order';
import { IconLink } from '../ui/buttons/IconLink';

/**
 * D107/D213: the review inbox icon with its count (named "Review · N") in the deck header. D198/FR-007: always shown to publishers (just "Review"
 * while the queue is empty) so the way into review never disappears.
 */
export function ReviewPill({ deckSlug }: { deckSlug: string }): ReactElement {
  const count = useQuery(reviewCountQuery(deckSlug)).data?.count ?? 0;
  return (
    <IconLink
      href={deckHref(deckSlug, 'review')}
      icon="inbox"
      label={count > 0 ? `Review · ${count}` : 'Review'}
      className="review-pill"
    >
      {count > 0 && (
        <span className="review-pill__count" aria-hidden="true">
          {count}
        </span>
      )}
    </IconLink>
  );
}
