import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useOnline } from '../api/offline';
import { configQuery } from '../api/queries';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { ShareRow } from './ShareRow';
import { sharesQuery } from './shares-queries';

export const SHARING_OFF = 'Sharing is off for this pocketbook.';

/**
 * D198: "Your shares" — the caller's shares to this deck over the last 30 days with their live
 * status. Offline it shows the last loaded list with its actions disabled (FR-016).
 */
export function SharesScreen({ deckSlug }: { deckSlug: string }): ReactElement {
  const query = useQuery(sharesQuery(deckSlug));
  const config = useQuery(configQuery());
  const online = useOnline();
  const shares = query.data?.shares ?? [];
  const sharingOff = config.data?.ingest.enabled === false;
  const now = new Date();

  if (query.isPending) return <LoadingState label="Loading your shares…" />;
  if (query.isError && !query.data) {
    return (
      <ErrorState
        message={accessErrorCopy(query.error, 'pocketbook')}
        onRetry={isRetryable(query.error) ? () => void query.refetch() : undefined}
      />
    );
  }

  return (
    <section className="shares" aria-labelledby="shares-title">
      <h2 id="shares-title">Your shares</h2>
      {!online && (
        <p className="share-notice" role="status">
          You're offline. This is the last loaded list.
        </p>
      )}
      {sharingOff && shares.length > 0 && (
        <p className="share-notice" role="status">
          {SHARING_OFF}
        </p>
      )}
      {shares.length === 0 ? (
        <EmptyState title={sharingOff ? SHARING_OFF : 'No shares yet'}>
          {sharingOff
            ? 'Shares need an assistant, and none is set up on this server.'
            : 'Links, photos and notes you share to this pocketbook in the last 30 days show up here.'}
        </EmptyState>
      ) : (
        <ul className="shares__list">
          {shares.map((share) => (
            <ShareRow key={share.id} share={share} deckSlug={deckSlug} online={online} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
