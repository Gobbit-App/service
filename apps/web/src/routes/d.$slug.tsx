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
import { DeckSettingsLink } from '../deck-admin/DeckSettingsLink';
import { ActivityLink } from '../events/ActivityLink';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { writeLastDeck } from '../lib/last-deck';
import { categoryFromFilter, isBrowsePath } from '../browse/browse-params';
import { ImportLink } from '../import/ImportLink';
import { AddCardLink } from '../items/AddCardLink';
import { BrowseButton } from '../items/BrowseButton';
import { ReviewPill } from '../review/ReviewPill';
import { SharesLink } from '../shares/SharesLink';
import { PasteLink } from '../share/PasteLink';
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
  const reviewing = pathname.endsWith('/review');
  const logging = pathname.endsWith('/log');
  const configuring = pathname.endsWith('/settings');
  const importing = pathname.endsWith('/import');
  const sharing = pathname.endsWith('/shares');
  const browsing = isBrowsePath(pathname);
  const view = viewFromPath(pathname)?.view ?? null;
  // Browse cycles All + categories only, so the button shows on those lists (contract §1).
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
        back={backTarget(adding ? { kind: 'new-card', deckSlug: slug } : { kind: 'deck' })}
        actions={
          <>
            {browseC !== null && <BrowseButton deckSlug={slug} c={browseC} />}
            {can(deck.data.role, 'item.publish') && <ReviewPill deckSlug={slug} />}
            <ActivityLink deckSlug={slug} role={deck.data.role} />
            <DeckSettingsLink deckSlug={slug} role={deck.data.role} />
          </>
        }
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
        {!adding &&
          !searching &&
          !reviewing &&
          !logging &&
          !configuring &&
          !importing &&
          !sharing &&
          can(deck.data.role, 'item.create') && (
            <div className="deck-actions">
              <AddCardLink deckSlug={slug} role={deck.data.role} />
              <PasteLink deckSlug={slug} role={deck.data.role} />
              <ImportLink deckSlug={slug} role={deck.data.role} />
              <SharesLink deckSlug={slug} role={deck.data.role} />
            </div>
          )}
        <Outlet />
      </main>
    </>
  );
}
