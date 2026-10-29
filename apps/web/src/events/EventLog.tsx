import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { eventsQuery } from '../api/events';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { EventRow } from './EventRow';
import { Button } from '../ui/buttons/Button';

/** D188: the deck's activity log, newest first; `itemId` narrows it to one card's history. */
export function EventLog({
  deckSlug,
  itemId,
}: {
  deckSlug: string;
  itemId?: string;
}): ReactElement {
  const query = useInfiniteQuery(eventsQuery(deckSlug, itemId));
  const events = query.data?.pages.flatMap((p) => p.data) ?? [];
  const now = new Date();

  if (query.isPending) return <LoadingState label="Loading activity…" />;
  if (query.isError && events.length === 0) {
    return (
      <ErrorState
        message={accessErrorCopy(query.error, 'deck')}
        onRetry={isRetryable(query.error) ? () => void query.refetch() : undefined}
      />
    );
  }

  return (
    <section className="event-log" aria-labelledby="event-log-title">
      <h2 id="event-log-title">{itemId ? 'Card history' : 'Activity'}</h2>
      {itemId && (
        <p className="event-log__scope">
          <NavLink href={deckHref(deckSlug, 'log')}>All activity</NavLink>
        </p>
      )}
      {events.length === 0 ? (
        <EmptyState title="No activity yet">
          Card changes are recorded from the day the activity log was turned on.
        </EmptyState>
      ) : (
        <ul className="event-log__list">
          {events.map((event) => (
            <EventRow key={event.id} event={event} now={now} />
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
