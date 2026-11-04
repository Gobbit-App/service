import { useQuery } from '@tanstack/react-query';
import { useId, type ReactElement } from 'react';
import type { PendingItem } from '@gobbit/shared/reminders';
import { isNetworkError } from '../api/network-state';
import { useOnline } from '../api/offline';
import { pendingQuery } from '../api/pending';
import { NavLink } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { pendingEntryMeta } from './pending-entry';
import './notifications.css';

function Entry({
  entry,
  section,
}: {
  entry: PendingItem;
  section: 'waiting' | 'upcoming';
}): ReactElement {
  const meta = pendingEntryMeta(entry, section);
  return (
    <li>
      <NavLink href={`/i/${encodeURIComponent(entry.itemId)}`} className="notifications-entry">
        <span className="notifications-entry__title">{entry.title}</span>
        <span
          className={
            meta.overdue
              ? 'notifications-entry__meta notifications-entry__meta--overdue'
              : 'notifications-entry__meta'
          }
        >
          {meta.text}
        </span>
      </NavLink>
    </li>
  );
}

function Section({
  title,
  entries,
  section,
}: {
  title: string;
  entries: PendingItem[];
  section: 'waiting' | 'upcoming';
}): ReactElement {
  const headingId = useId();
  return (
    <section className="notifications-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <ul className="notifications-list">
        {entries.map((entry) => (
          <Entry key={entry.itemId} entry={entry} section={section} />
        ))}
      </ul>
    </section>
  );
}

/**
 * 037 (D298, FR-021–FR-023): what is waiting on you across your decks, then your reminders that
 * aren't showing yet. Offline it shows the last known list (persisted query cache) with a note.
 */
export function NotificationsScreen(): ReactElement {
  const pending = useQuery(pendingQuery());
  const online = useOnline();

  if (pending.isPending) return <LoadingState label="Loading notifications…" />;
  if (!pending.data) {
    return (
      <ErrorState
        message={
          isNetworkError(pending.error)
            ? "You're offline. Notifications need a connection the first time."
            : "Couldn't load your notifications."
        }
        onRetry={() => void pending.refetch()}
      />
    );
  }

  const { items, upcoming } = pending.data;
  const stale = !online || (pending.isError && isNetworkError(pending.error));
  return (
    <>
      {stale && (
        <p className="notifications-offline" role="status">
          Showing the last known list
        </p>
      )}
      {items.length > 0 ? (
        <Section title="Waiting on you" entries={items} section="waiting" />
      ) : (
        <EmptyState title="Nothing waiting on you" />
      )}
      {upcoming.length > 0 && <Section title="Upcoming" entries={upcoming} section="upcoming" />}
    </>
  );
}
