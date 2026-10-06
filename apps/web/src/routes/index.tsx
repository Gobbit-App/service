import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { isNetworkError } from '../api/network-state';
import { decksQuery } from '../api/queries';
import { AppHeader } from '../app/AppHeader';
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

  if (decks.isPending) return <LoadingState label="Loading pocketbooks…" />;
  if (decks.isError && !decks.data) {
    return (
      <main className="page">
        <ErrorState
          message={
            isNetworkError(decks.error)
              ? "You're offline and your pocketbooks aren't saved on this device yet."
              : "Couldn't load your pocketbooks."
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
  if (landing) return <Navigate to="/d/$slug" params={{ slug: landing }} replace />;

  return (
    <>
      <AppHeader title="Pocketbooks" />
      <main className="page">
        {decks.data.length === 0 ? (
          <EmptyState title="No pocketbooks yet">
            Ask someone in your family to invite you to theirs.
          </EmptyState>
        ) : (
          <ul className="deck-list">
            {decks.data.map((deck) => (
              <li key={deck.id}>
                <NavLink href={`/d/${encodeURIComponent(deck.slug)}`} className="deck-list__link">
                  <span dir="auto">{deck.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
