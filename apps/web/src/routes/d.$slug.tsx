import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { useEffect } from 'react';
import { categoriesQuery, deckQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { writeLastDeck } from '../lib/last-deck';
import { viewFromPath, type ChipView } from '../ui/chip-order';
import { ChipRow } from '../ui/ChipRow';
import { useNavigateHref } from '../ui/NavLink';
import { ErrorState, LoadingState } from '../ui/StatusViews';

const ALL: ChipView = { kind: 'all' };

/** Deck layout (D65): header, chip row and the selected list view. */
export const Route = createFileRoute('/d/$slug')({
  component: DeckLayout,
});

function DeckLayout() {
  const { slug } = Route.useParams();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));
  const { pathname } = useLocation();
  const navigate = useNavigateHref();
  const deckSlug = deck.data?.slug;

  useEffect(() => {
    if (deckSlug) writeLastDeck(deckSlug);
  }, [deckSlug]);

  if (deck.isPending) return <LoadingState label="Loading pocketbook…" />;
  if (deck.isError && !deck.data) {
    return (
      <main className="page">
        <ErrorState
          title="Pocketbook unavailable"
          message={accessErrorCopy(deck.error, 'pocketbook')}
          onRetry={isRetryable(deck.error) ? () => void deck.refetch() : undefined}
        />
      </main>
    );
  }

  return (
    <>
      <AppHeader title={deck.data.name} />
      <ChipRow
        deckSlug={slug}
        categories={categories.data ?? []}
        active={viewFromPath(pathname)?.view ?? ALL}
        showArchived={can(deck.data.role, 'item.archive')}
        onNavigate={navigate}
      />
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
