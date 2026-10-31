import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { Deck } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import { decksQuery } from '../api/queries';
import { readLastDeck } from '../lib/last-deck';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { defaultShareDeck, shareableDecks } from './share-deck';
import { clearPending } from './share-store';
import { ShareForm } from './ShareForm';
import { ShareSent } from './ShareSent';
import { usePendingShare } from './use-pending-share';

export const FAILED_NOTICE = "Couldn't receive what you shared. Paste it below instead.";
export const EXPIRED_NOTICE = 'That share expired or was already sent. Paste it below instead.';

/**
 * D108: `/share`. `pendingId` comes from the Android share target (via the SW), `requestedDeck`
 * from the deck's "Paste" entry; with neither it's an empty paste box.
 */
export function ShareScreen({
  pendingId,
  requestedDeck,
  failed = false,
}: {
  pendingId?: string;
  requestedDeck?: string;
  failed?: boolean;
}): ReactElement {
  const pending = usePendingShare(pendingId);
  const decks = useQuery(decksQuery());
  const [sent, setSent] = useState<{ deck: Deck; shareId: string } | null>(null);

  if (sent) return <ShareSent deck={sent.deck} shareId={sent.shareId} />;
  if (pending.status === 'loading' || decks.isPending) return <LoadingState label="Loading…" />;
  if (decks.isError && !decks.data) {
    return (
      <ErrorState
        message={
          isNetworkError(decks.error)
            ? "You're offline. Sharing needs a connection."
            : "Couldn't load your decks."
        }
        onRetry={() => void decks.refetch()}
      />
    );
  }

  const targets = shareableDecks(decks.data);
  const initialDeck = defaultShareDeck(targets, requestedDeck, readLastDeck());
  if (!initialDeck) {
    return (
      <EmptyState title="Nowhere to share to">
        You can only read the decks you're in. Ask an owner to make you an editor.
      </EmptyState>
    );
  }

  const notice = failed ? FAILED_NOTICE : pendingId && !pending.payload ? EXPIRED_NOTICE : null;
  const handleSent = (deck: Deck, shareId: string) => {
    setSent({ deck, shareId });
    if (pending.payload) {
      clearPending().catch((err: unknown) =>
        console.warn('[share] clearing the pending share failed', err),
      );
    }
  };

  return (
    <>
      {notice && (
        <p className="share-notice" role="status">
          {notice}
        </p>
      )}
      <ShareForm
        decks={targets}
        initialDeck={initialDeck}
        initial={pending.payload}
        channel={pending.payload ? 'pwa' : 'paste'}
        onSent={handleSent}
      />
    </>
  );
}
