import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { categoriesQuery, deckQuery } from '../api/queries';
import { backTarget } from '../app/back-target';
import { BottomBar } from '../app/BottomBar';
import { isSearchPath, showsListTools } from '../app/list-tools';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { writeLastDeck } from '../lib/last-deck';
import { categoryFromFilter, isBrowsePath } from '../browse/browse-params';
import { DeckHeader } from '../deck-header/DeckHeader';
import { parseSearchParams } from '../search/search-params';
import { viewFromPath } from '../ui/chip-order';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/**
 * Deck layout (D65): the breadcrumb header (D380), the selected page and the bottom bar (D274).
 * Browse and the new-card composer render without it (D139, D300); the view switcher and Search
 * show only on the card lists, not on pages like Your shares or Review (`showsListTools`).
 */
export const Route = createFileRoute('/d/$slug')({
  component: DeckLayout,
});

function DeckLayout() {
  const { slug } = Route.useParams();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));
  const { pathname } = useLocation();
  const deckSlug = deck.data?.slug;
  const adding = pathname.endsWith('/new');
  const searching = isSearchPath(pathname);
  const listTools = showsListTools(pathname);
  const browsing = isBrowsePath(pathname);
  const view = viewFromPath(pathname)?.view ?? null;
  // D277: Browse opens on the list's category, or All from any other deck page.
  const browseC = view ? categoryFromFilter(view) : null;
  const { q, mode } = parseSearchParams(useSearch({ strict: false }));
  const routerNavigate = useNavigate();

  // D382: a search from the sheet opens `/d/$slug/search?q=`, refining one replaces it.
  const onSearch = useCallback(
    (next: string) => {
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

  // D139 / D300: Browse and the card composer are full screen; the deck chrome steps aside.
  if (browsing || adding) return <Outlet />;

  return (
    <>
      <DeckHeader
        deck={deck.data}
        back={backTarget(
          view?.kind === 'all' ? { kind: 'deck' } : { kind: 'deck-page', deckSlug: slug },
        )}
        list={
          listTools
            ? {
                categories: categories.data ?? [],
                view,
                query: searching ? q : '',
                onSearch,
              }
            : null
        }
      />
      <main className="page">
        <Outlet />
      </main>
      <BottomBar deck={deck.data} browseC={browseC} />
    </>
  );
}
