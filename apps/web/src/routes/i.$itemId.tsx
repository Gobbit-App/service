import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { categoriesQuery, deckQuery, itemQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { Card } from '../cards/Card';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { NavLink } from '../ui/NavLink';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/** P3.2: a single card (the target of shared links) with its deck as context. */
export const Route = createFileRoute('/i/$itemId')({
  component: ItemPage,
});

function ItemPage() {
  const { itemId } = Route.useParams();
  const item = useQuery(itemQuery(itemId));
  const deckId = item.data?.deckId;
  const deck = useQuery({ ...deckQuery(deckId ?? ''), enabled: deckId !== undefined });
  const categories = useQuery({ ...categoriesQuery(deckId ?? ''), enabled: deckId !== undefined });

  if (item.isPending) return <LoadingState label="Loading card…" />;
  if (item.isError && !item.data) {
    return (
      <main className="page">
        <ErrorState
          title="Card unavailable"
          message={accessErrorCopy(item.error, 'card')}
          onRetry={isRetryable(item.error) ? () => void item.refetch() : undefined}
        />
      </main>
    );
  }

  const deckSlug = deck.data?.slug ?? item.data.deckId;
  return (
    <>
      <AppHeader title={deck.data?.name ?? 'Card'} />
      <main className="page">
        <Card
          item={item.data}
          deckSlug={deckSlug}
          categories={categories.data ?? []}
          linkTitle={false}
        />
        <p className="page__back">
          <NavLink href={`/d/${encodeURIComponent(deckSlug)}`}>
            More from {deck.data?.name ?? 'this pocketbook'}
          </NavLink>
        </p>
      </main>
    </>
  );
}
