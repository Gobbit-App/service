import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { isNetworkError } from '../api/network-state';
import { decksQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
import { BottomBar } from '../app/BottomBar';
import { ALL_CATEGORIES } from '../browse/browse-params';
import { deckEntryHref, opensInBrowse } from '../app/deck-entry';
import { NewDeckForm } from '../decks/NewDeckForm';
import { pickLanding, readLastDeck } from '../lib/last-deck';
import { NavLink } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';

/** `?all=true` shows the list even when there is a deck to land on. */
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { all?: boolean } =>
    search.all === true || search.all === 'true' ? { all: true } : {},
  component: Home,
});

function Home() {
  const { all } = Route.useSearch();
  const decks = useQuery(decksQuery());
  const [creating, setCreating] = useState(false);

  if (decks.isPending) return <LoadingState label="Loading decks…" />;
  if (decks.isError && !decks.data) {
    return (
      <main className="page">
        <ErrorState
          message={
            isNetworkError(decks.error)
              ? "You're offline and your decks aren't saved on this device yet."
              : "Couldn't load your decks."
          }
          onRetry={() => void decks.refetch()}
        />
      </main>
    );
  }

  const landing = all
    ? null
    : pickLanding(
        decks.data.map((d) => d.slug),
        readLastDeck(),
      );
  if (landing) {
    // D268: members who don't run the deck land in Browse.
    const role = decks.data.find((d) => d.slug === landing)?.role;
    return role && opensInBrowse(role) ? (
      <Navigate
        to="/d/$slug/browse"
        params={{ slug: landing }}
        search={{ c: ALL_CATEGORIES }}
        replace
      />
    ) : (
      <Navigate to="/d/$slug" params={{ slug: landing }} replace />
    );
  }

  return (
    <>
      <AppHeader title="Decks" back={null} />
      <main className="page">
        {decks.data.length === 0 ? (
          <EmptyState title="No decks yet" />
        ) : (
          <ul className="deck-list">
            {decks.data.map((deck) => (
              <li key={deck.id}>
                <NavLink href={deckEntryHref(deck)} className="deck-list__link">
                  <span dir="auto">{deck.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        {creating && (
          <div className="new-deck__slot">
            <NewDeckForm onClose={() => setCreating(false)} />
          </div>
        )}
      </main>
      <BottomBar onNewDeck={() => setCreating(true)} />
    </>
  );
}
