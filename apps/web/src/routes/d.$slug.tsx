import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { useCallback, useEffect } from 'react';
import { categoriesQuery, deckQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { writeLastDeck } from '../lib/last-deck';
import { AddCardLink } from '../items/AddCardLink';
import { SearchBox } from '../search/SearchBox';
import { parseSearchParams } from '../search/search-params';
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
  const adding = pathname.endsWith('/new');
  const searching = pathname.endsWith('/search');
  const { q, mode } = parseSearchParams(useSearch({ strict: false }));
  const routerNavigate = useNavigate();

  // D79: the pinned box drives `/d/$slug/search?q=`; typing there replaces history entries.
  const onSearch = useCallback(
    (next: string) => {
      if (!next && !searching) return;
      void routerNavigate({
        to: '/d/$slug/search',
        params: { slug },
        search: { q: next, mode },
        replace: searching,
      });
    },
    [routerNavigate, slug, mode, searching],
  );

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
      <SearchBox initialQuery={searching ? q : ''} onSearch={onSearch} />
      <ChipRow
        deckSlug={slug}
        categories={categories.data ?? []}
        active={viewFromPath(pathname)?.view ?? ALL}
        showArchived={can(deck.data.role, 'item.archive')}
        onNavigate={navigate}
      />
      <main className="page">
        {!adding && !searching && <AddCardLink deckSlug={slug} role={deck.data.role} />}
        <Outlet />
      </main>
    </>
  );
}
