import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { categoriesQuery, deckQuery } from '../api/queries';
import { ReviewQueue } from '../review/ReviewQueue';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/** D107: the review queue, inside the deck layout (`/d/:slug/review`); publishers only. */
export const Route = createFileRoute('/d/$slug/review')({
  component: Review,
});

function Review() {
  const { slug } = Route.useParams();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));

  if (deck.isPending || categories.isPending) return <LoadingState label="Loading…" />;
  if (!deck.data) return <ErrorState message="Couldn't load this pocketbook." />;
  if (!can(deck.data.role, 'item.publish')) {
    return <ErrorState title="Not available" message="Only owners and maintainers review cards." />;
  }

  return (
    <ReviewQueue
      deckSlug={slug}
      categories={categories.data ?? []}
      canCreateCategory={can(deck.data.role, 'category.create')}
    />
  );
}
