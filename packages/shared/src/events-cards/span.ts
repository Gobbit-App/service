import { addDaysToIsoDate, instantOnDate } from '../event-time/zoned';
import { EVENT_DEFAULT_LENGTH_MS } from './constants';

/** The time fields of an event payload (D357). */
export interface EventTimes {
  allDay: boolean;
  start: string;
  end?: string;
  timeZone: string;
}

export interface EventInstants {
  startsAt: Date;
  /** Effective end, exclusive. */
  endsAt: Date;
}

/**
 * D358: the `event_cards` span of a payload, the same arithmetic as the `items_event_sync` trigger
 * (a parity integration test keeps them equal). Timed: `end` or start + 1 h. All-day: the start date
 * at 00:00 in the zone → the day after the end (or start) date at 00:00.
 */
export function eventSpan(p: EventTimes): EventInstants {
  if (p.allDay) {
    return {
      startsAt: instantOnDate(p.start, p.timeZone),
      endsAt: instantOnDate(addDaysToIsoDate(p.end ?? p.start, 1), p.timeZone),
    };
  }
  const startsAt = new Date(p.start);
  const endsAt = p.end ? new Date(p.end) : new Date(startsAt.getTime() + EVENT_DEFAULT_LENGTH_MS);
  return { startsAt, endsAt };
}
