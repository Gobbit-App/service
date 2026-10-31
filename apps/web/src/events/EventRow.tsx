import type { ItemEvent } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { relativeTime } from '../lib/relative-time';
import { NavLink } from '../ui/NavLink';
import { actorLabel, changesLabel, eventLabel, viaBadge } from './event-copy';

/** D188: one log line — action, card title (a link while the card exists), person and time. */
export function EventRow({ event, now }: { event: ItemEvent; now: Date }): ReactElement {
  const changes = changesLabel(event.changes);
  const badge = viaBadge(event.via);
  return (
    <li className="event-row">
      <div className="event-row__line">
        <span className="event-row__action">{eventLabel(event.kind)}</span>{' '}
        {event.itemId ? (
          <NavLink href={`/i/${event.itemId}`} className="event-row__title">
            {event.title}
          </NavLink>
        ) : (
          <span className="event-row__title" dir="auto">
            {event.title}
          </span>
        )}
        {changes && <span className="event-row__changes"> · {changes}</span>}
      </div>
      <div className="event-row__meta">
        <span dir="auto">{actorLabel(event)}</span>
        {' · '}
        <time dateTime={event.createdAt}>{relativeTime(new Date(event.createdAt), now)}</time>
        {badge && <span className="event-row__badge">{badge}</span>}
      </div>
    </li>
  );
}
