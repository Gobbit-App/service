import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { can } from '@gobbit/shared/authz';
import { useCallback, useEffect } from 'react';
import { categoriesQuery, deckQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { backTarget } from '../app/back-target';
import { BottomBar } from '../app/BottomBar';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { writeLastDeck } from '../lib/last-deck';
import { categoryFromFilter, isBrowsePath } from '../browse/browse-params';
import { SearchBox } from '../search/SearchBox';
import { parseSearchParams } from '../search/search-params';
import { viewFromPath, type ChipView } from '../ui/chip-order';
import { ChipRow } from '../ui/ChipRow';
import { useNavigateHref } from '../ui/NavLink';
import { ErrorState, LoadingState } from '../ui/StatusViews';

const ALL: ChipView = { kind: 'all' };

/** Deck layout (D65): header, chip row, the selected list view and the bottom bar (D274). */
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
  const browsing = isBrowsePath(pathname);
  const view = viewFromPath(pathname)?.view ?? null;
  // D277: Browse opens on the list's category, or All from any other deck page.
  const browseC = view ? categoryFromFilter(view) : null;
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

  if (deck.isPending) return <LoadingState label="Loading deck…" />;
  if (deck.isError && !deck.data) {
    return (
      <main className="page">
        <ErrorState
          title="Deck unavailable"
          message={accessErrorCopy(deck.error, 'deck')}
          onRetry={isRetryable(deck.error) ? () => void deck.refetch() : undefined}
        />
      </main>
    );
  }

  // D139: Browse is full screen; the deck chrome steps aside.
  if (browsing) return <Outlet />;

  return (
    <>
      <AppHeader
        title={deck.data.name}
        back={backTarget(
          view?.kind === 'all' ? { kind: 'deck' } : { kind: 'deck-page', deckSlug: slug },
        )}
      />
      <SearchBox initialQuery={searching ? q : ''} onSearch={onSearch} />
      <ChipRow
        deckSlug={slug}
        categories={categories.data ?? []}
        active={view ?? ALL}
        showArchived={can(deck.data.role, 'item.archive')}
        showLinks={can(deck.data.role, 'item.update')}
        onNavigate={navigate}
      />
      <main className="page">
        <Outlet />
      </main>
      {/* D274: the editor keeps its own save bar, so the bottom bar steps aside there. */}
      {!adding && <BottomBar deck={deck.data} browseC={browseC} />}
    </>
  );
}
