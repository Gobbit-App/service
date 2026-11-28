import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, type ReactElement } from 'react';
import type { DeckDetail } from '@gobbit/shared';
import { ROLE_WELCOME } from '@gobbit/shared/authz';
import { isApiError } from '../api/api-error';
import { dismissWelcome } from '../api/deck-welcome';
import { categoriesQuery } from '../api/queries';
import { queryKeys } from '../api/query-keys';
import { ALL_CATEGORIES, fromListState } from '../browse/browse-params';
import { withLayer } from '../browse/browse-layer';
import { Button } from '../ui/buttons/Button';
import { Sheet } from '../ui/sheet/Sheet';
import {
  addPendingDismissal,
  readPendingDismissals,
  removePendingDismissal,
} from './welcome-store';

/** D481: one DELETE; the id stays pending on any failure that a retry could fix. */
async function sendDismissal(deckId: string, membershipId: string): Promise<void> {
  // The route takes no membership id, so a stale retry must not act for whoever is signed in now.
  if (!readPendingDismissals().includes(membershipId)) return;
  try {
    await dismissWelcome(deckId);
    removePendingDismissal(membershipId);
  } catch (error) {
    if (isApiError(error) && error.status === 404) removePendingDismissal(membershipId);
    else
      window.addEventListener('online', () => void sendDismissal(deckId, membershipId), {
        once: true,
      });
  }
}

/** D481/FR-011: re-sends a dismissal this device holds when the deck opens (a failed send retries itself when the browser comes online). */
export function useWelcomeRetry(deck: DeckDetail): void {
  const membershipId = deck.welcome?.membershipId;
  const deckId = deck.id;
  useEffect(() => {
    if (membershipId && readPendingDismissals().includes(membershipId)) {
      void sendDismissal(deckId, membershipId);
    }
  }, [deckId, membershipId]);
}

function dismiss(queryClient: QueryClient, deck: DeckDetail): void {
  const membershipId = deck.welcome?.membershipId;
  queryClient.setQueryData<DeckDetail>(queryKeys.deck(deck.slug), (prev) =>
    prev ? { ...prev, welcome: null } : prev,
  );
  if (!membershipId) return;
  addPendingDismissal(membershipId);
  void sendDismissal(deck.id, membershipId);
}

/** D483/D484: the first-run sheet for an invited member: where you are, who asked you, what you can do. */
export function DeckWelcome({
  deck,
  setSearchOpen,
}: {
  deck: DeckDetail;
  setSearchOpen: (open: boolean) => void;
}): ReactElement {
  const titleId = useId();
  const start = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const categories = useQuery(categoriesQuery(deck.slug));
  const inviter = deck.welcome?.inviter ?? null;
  const close = () => dismiss(queryClient, deck);

  const openCategories = async () => {
    close();
    const to = '/d/$slug/browse' as const;
    const params = { slug: deck.slug };
    const search = { c: ALL_CATEGORIES };
    await navigate({
      to,
      params,
      search,
      state: (prev) => ({ ...prev, ...fromListState(ALL_CATEGORIES) }),
    });
    await navigate({ to, params, search, state: (prev) => withLayer(prev, 'categories') });
  };

  return (
    <Sheet labelledBy={titleId} onClose={close} initialFocus={start}>
      <h2 className="sheet__title" id={titleId}>
        Welcome to <bdi>{deck.name}</bdi>
      </h2>
      {inviter && (
        <p className="sheet__text">
          <bdi>{inviter.name ?? inviter.username ?? 'A member'}</bdi> invited you.
        </p>
      )}
      <p className="sheet__text">{ROLE_WELCOME[deck.role]}</p>
      <div className="sheet__actions">
        <Button ref={start} icon="check" label="Start reading" onClick={close} />
        <Button
          icon="search"
          label="Search"
          variant="ghost"
          onClick={() => {
            close();
            setSearchOpen(true);
          }}
        />
        {(categories.data?.length ?? 0) > 0 && (
          <Button
            icon="browse"
            label="Categories"
            variant="ghost"
            onClick={() => void openCategories()}
          />
        )}
      </div>
    </Sheet>
  );
}
