import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { can } from '@gobbit/shared/authz';
import { useOnline } from '../api/offline';
import { categoriesQuery, deckQuery, meQuery } from '../api/queries';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { CategoriesSection } from './CategoriesSection';
import { DeckSection } from './DeckSection';
import { MembersSection } from './MembersSection';

/**
 * D184: deck settings (`/d/$slug/settings`). Admins (`deck.update`) get Deck, Categories and
 * Members; other roles see the member list only; the personal deck has its name only.
 * Offline, everything is read-only.
 */
export function DeckAdminScreen({ deckSlug }: { deckSlug: string }): ReactElement {
  const deck = useQuery(deckQuery(deckSlug));
  const categories = useQuery(categoriesQuery(deckSlug));
  const me = useQuery(meQuery());
  const online = useOnline();

  if (deck.isPending) return <LoadingState label="Loading settings…" />;
  if (!deck.data) {
    return (
      <ErrorState
        message={accessErrorCopy(deck.error, 'pocketbook')}
        onRetry={isRetryable(deck.error) ? () => void deck.refetch() : undefined}
      />
    );
  }

  const admin = can(deck.data.role, 'deck.update');
  const categoryList = categories.data ?? [];

  return (
    <div className="deck-admin">
      <h2 className="deck-admin__title">Deck settings</h2>
      {!online && (
        <p className="settings-notice" role="status">
          You’re offline. Settings are read-only until you reconnect.
        </p>
      )}
      {deck.data.isDefault ? (
        <DeckSection deck={deck.data} categories={categoryList} online={online} />
      ) : (
        <>
          {admin ? (
            <>
              <DeckSection deck={deck.data} categories={categoryList} online={online} />
              <CategoriesSection deck={deck.data} categories={categoryList} online={online} />
            </>
          ) : (
            <p className="settings-notice">Only admins can change this deck.</p>
          )}
          <MembersSection deck={deck.data} meId={me.data?.user.id} online={online} />
        </>
      )}
    </div>
  );
}
