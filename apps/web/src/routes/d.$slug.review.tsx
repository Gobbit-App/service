import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@gobbit/shared/authz';
import { categoriesQuery, deckQuery } from '../api/queries';
import { ReviewQueue } from '../review/ReviewQueue';
import { parseReviewSearch } from '../review/review-search';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/**
 * D107: the review queue, inside the deck layout (`/d/:slug/review`); publishers only.
 * D191: `?source=<label>` shows one import's proposals.
 */
export const Route = createFileRoute('/d/$slug/review')({
  validateSearch: parseReviewSearch,
  component: Review,
});

function Review() {
  const { slug } = Route.useParams();
  const { source } = Route.useSearch();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));

  if (deck.isPending || categories.isPending) return <LoadingState label="Loading…" />;
  if (!deck.data) return <ErrorState message="Couldn't load this pocketbook." />;
  if (!can(deck.data.role, 'item.publish')) {
    return <ErrorState title="Not available" message="Only owners and maintainers review cards." />;
  }

  return (
    <ReviewQueue
      deck={deck.data}
      categories={categories.data ?? []}
      canCreateCategory={can(deck.data.role, 'category.create')}
      source={source}
    />
  );
}
