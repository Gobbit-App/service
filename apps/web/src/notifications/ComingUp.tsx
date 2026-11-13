import { useId, type ReactElement } from 'react';
import { formatEventStatus } from '@gobbit/shared/event-time';
import type { ComingUpEntry } from '@gobbit/shared/reminders';
import { deviceTimeZone } from '../lib/device-time-zone';
import { useMinuteClock } from '../lib/use-minute-clock';
import { NavLink } from '../ui/NavLink';

function Entry({
  entry,
  now,
  viewerTimeZone,
}: {
  entry: ComingUpEntry;
  now: Date;
  viewerTimeZone: string;
}): ReactElement {
  const when = formatEventStatus(entry, now, viewerTimeZone, { now });
  return (
    <li>
      <NavLink href={`/i/${encodeURIComponent(entry.itemId)}`} className="notifications-entry">
        <span className="notifications-entry__title">{entry.title}</span>
        <span className="notifications-entry__meta">{`${entry.deck.name} · ${when}`}</span>
        {entry.location && (
          <span className="notifications-entry__meta" dir="auto">
            {entry.location}
          </span>
        )}
      </NavLink>
    </li>
  );
}

/**
 * 042 (T073, D366): events whose first notice has fired and that haven't ended, soonest first.
 * Hidden when empty; the bell never counts them.
 */
export function ComingUp({
  entries,
  viewerTimeZone = deviceTimeZone(),
}: {
  entries: readonly ComingUpEntry[];
  /** Tests pin the zone. */
  viewerTimeZone?: string;
}): ReactElement | null {
  const headingId = useId();
  const now = useMinuteClock();
  if (entries.length === 0) return null;
  return (
    <section className="notifications-section" aria-labelledby={headingId}>
      <h2 id={headingId}>Coming up</h2>
      <ul className="notifications-list">
        {entries.map((entry) => (
          <Entry key={entry.itemId} entry={entry} now={now} viewerTimeZone={viewerTimeZone} />
        ))}
      </ul>
    </section>
  );
}
