import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { AdminWaitlistEntry, WaitlistKind, WaitlistStatus } from '@gobbit/shared';
import { waitlistKinds, waitlistStatuses } from '@gobbit/shared/enums';
import { WAITLIST_KIND_LABELS, WAITLIST_STATUS_LABELS } from '@gobbit/shared/waitlist-constants';
import { isNetworkError } from '../api/network-state';
import { useOnline } from '../api/offline';
import { Button } from '../ui/buttons/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { adminWaitlistQuery } from './waitlist-queries';
import { WaitlistRow } from './WaitlistRow';

const EMPTY_COPY: Readonly<Record<WaitlistStatus, string>> = {
  pending: 'Nobody is waiting to confirm their email.',
  confirmed: 'Nobody is waiting for an invite.',
  invited: 'Nobody has been invited yet.',
  removed: 'Nothing has been removed.',
};

/** 032: the platform admin's waitlist — one status tab at a time, longest waiting first. */
export function WaitlistScreen(): ReactElement {
  const [status, setStatus] = useState<WaitlistStatus>('confirmed');
  const [kind, setKind] = useState<WaitlistKind | null>(null);
  const [mailFailed, setMailFailed] = useState<AdminWaitlistEntry[]>([]);
  const online = useOnline();
  const query = useInfiniteQuery(adminWaitlistQuery(status, kind));
  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.items);
  const counts = pages[0]?.counts;
  const now = new Date();

  const onMailFailed = (entry: AdminWaitlistEntry) =>
    setMailFailed((list) => [...list.filter((e) => e.id !== entry.id), entry]);

  return (
    <section className="waitlist-admin" aria-labelledby="waitlist-admin-title">
      <h2 id="waitlist-admin-title">Waitlist</h2>
      <div className="waitlist-admin__filters">
        <div className="waitlist-admin__tabs" role="group" aria-label="Status">
          {waitlistStatuses.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={s === status}
              onClick={() => setStatus(s)}
            >
              {WAITLIST_STATUS_LABELS[s]}
              {counts && (
                <>
                  {' '}
                  <span className="waitlist-admin__count">{counts[s]}</span>
                </>
              )}
            </button>
          ))}
        </div>
        <label className="waitlist-admin__kind">
          Kind
          <select
            value={kind ?? ''}
            onChange={(event) =>
              setKind((event.currentTarget.value || null) as WaitlistKind | null)
            }
          >
            <option value="">All kinds</option>
            {waitlistKinds.map((k) => (
              <option key={k} value={k}>
                {WAITLIST_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mailFailed.map((entry) => (
        <p key={entry.id} className="form-error" role="alert">
          {entry.email} is invited, but the email couldn’t be sent — resend it from Invited.
        </p>
      ))}

      {query.isPending ? (
        <LoadingState label="Loading the waitlist…" />
      ) : query.isError && entries.length === 0 ? (
        <ErrorState
          message={
            isNetworkError(query.error)
              ? "You're offline. The waitlist needs a connection."
              : "Couldn't load the waitlist."
          }
          onRetry={() => void query.refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState title="No one here">{EMPTY_COPY[status]}</EmptyState>
      ) : (
        <ul className="admin-list" aria-label={`${WAITLIST_STATUS_LABELS[status]} entries`}>
          {entries.map((entry) => (
            <WaitlistRow
              key={entry.id}
              entry={entry}
              now={now}
              online={online}
              onMailFailed={onMailFailed}
            />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          icon="arrow-down"
          label={query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          variant="ghost"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      )}
    </section>
  );
}
