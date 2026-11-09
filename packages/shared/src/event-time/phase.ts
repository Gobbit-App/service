import { daysBetweenIsoDates, isoDateIn } from './zoned';

/** D358: an event's schedule as stored in `event_cards` (and on the member DTO). */
export interface EventSpan {
  startsAt: Date | string;
  /** Effective end, exclusive. */
  endsAt: Date | string;
  allDay: boolean;
  timeZone: string;
}

export const eventPhases = ['upcoming', 'tomorrow', 'today', 'now', 'ended'] as const;
export type EventPhaseName = (typeof eventPhases)[number];

export interface EventPhase {
  phase: EventPhaseName;
  /** Calendar days until the start day (0 for today, now and ended are ≤ 0). */
  days: number;
  /** Milliseconds until the start (negative once started). */
  startsInMs: number;
}

const toMs = (d: Date | string): number => (typeof d === 'string' ? Date.parse(d) : d.getTime());

/** First and last calendar date of an all-day event, in its own zone (D357). */
export function allDayDates(span: EventSpan): { first: string; last: string } {
  return {
    first: isoDateIn(new Date(toMs(span.startsAt)), span.timeZone),
    last: isoDateIn(new Date(toMs(span.endsAt) - 1), span.timeZone),
  };
}

/**
 * D367: where an event stands for a viewer at `now`. Timed events compare instants and the viewer's
 * calendar days; all-day events compare their own dates with the viewer's today, so everyone sees the
 * same dates (FR-008).
 */
export function eventPhase(span: EventSpan, now: Date, viewerTimeZone: string): EventPhase {
  const startsInMs = toMs(span.startsAt) - now.getTime();
  const today = isoDateIn(now, viewerTimeZone);

  if (span.allDay) {
    const { first, last } = allDayDates(span);
    const days = daysBetweenIsoDates(today, first);
    if (daysBetweenIsoDates(today, last) < 0) return { phase: 'ended', days, startsInMs };
    if (days <= 0) return { phase: 'today', days, startsInMs };
    return { phase: days === 1 ? 'tomorrow' : 'upcoming', days, startsInMs };
  }

  const days = daysBetweenIsoDates(today, isoDateIn(new Date(toMs(span.startsAt)), viewerTimeZone));
  if (now.getTime() >= toMs(span.endsAt)) return { phase: 'ended', days, startsInMs };
  if (startsInMs <= 0) return { phase: 'now', days, startsInMs };
  if (days <= 0) return { phase: 'today', days, startsInMs };
  return { phase: days === 1 ? 'tomorrow' : 'upcoming', days, startsInMs };
}
