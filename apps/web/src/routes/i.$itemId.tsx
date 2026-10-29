import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { categoriesQuery, deckQuery, itemQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { backTarget } from '../app/back-target';
import { Card } from '../cards/Card';
import { CardActionBar } from '../cards/CardActionBar';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { deckHref } from '../ui/chip-order';
import { NavLink, useNavigateHref } from '../ui/NavLink';
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
  const navigate = useNavigateHref();

  if (item.isPending) return <LoadingState label="Loading card…" />;
  // D132: a deleted card (still in this device's cache after Delete) is unavailable too
  const deleted = item.data?.deletedAt !== undefined;
  if ((item.isError && !item.data) || deleted) {
    return (
      <main className="page">
        <ErrorState
          title="Card unavailable"
          message={deleted ? 'This card was deleted.' : accessErrorCopy(item.error, 'card')}
          onRetry={!deleted && isRetryable(item.error) ? () => void item.refetch() : undefined}
        />
      </main>
    );
  }

  const deckSlug = deck.data?.slug ?? item.data.deckId;
  return (
    <>
      <AppHeader title={deck.data?.name ?? 'Card'} back={backTarget({ kind: 'card', deckSlug })} />
      <main className="page">
        <Card
          item={item.data}
          deckSlug={deckSlug}
          categories={categories.data ?? []}
          linkTitle={false}
          actions={
            deck.data && (
              <CardActionBar
                item={item.data}
                deckSlug={deckSlug}
                role={deck.data.role}
                onDone={(action) => {
                  // D146: back to the deck, where the toast offers Undo
                  if (action === 'archive' || action === 'delete') navigate(deckHref(deckSlug));
                }}
              />
            )
          }
        />
        <p className="page__back">
          <NavLink href={deckHref(deckSlug)}>More from {deck.data?.name ?? 'this deck'}</NavLink>
        </p>
      </main>
    </>
  );
}
