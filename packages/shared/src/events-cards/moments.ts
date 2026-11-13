import {
  addDaysToIsoDate,
  instantFromWallClock,
  instantOnDate,
  wallClockAt,
} from '../event-time/zoned';
import { EVENT_ALLDAY_NOTICE_HOUR, EVENT_UNIT_MS, type EventNoticeUnit } from './constants';
import { eventSpan, type EventTimes } from './span';

export interface NotifyBefore {
  amount: number;
  unit: EventNoticeUnit;
}

export interface EventNoticeMoment extends NotifyBefore {
  /** The start this moment belongs to (`event_notices.starts_at`). */
  startsAt: Date;
  fireAt: Date;
}

export interface MomentLimits {
  /** Hour (0–23, event zone) all-day notices go out. */
  allDayNoticeHour: number;
}

/**
 * D359: when each notify-before time fires. Minutes and hours are exact durations; days keep the
 * wall-clock time of the start in the event's zone (DST-safe); all-day events fire on day D − N at
 * the notice hour in their zone.
 */
export function eventNoticeMoments(
  p: EventTimes & { notify: { before: readonly NotifyBefore[] } },
  limits: MomentLimits = { allDayNoticeHour: EVENT_ALLDAY_NOTICE_HOUR },
): EventNoticeMoment[] {
  const { startsAt } = eventSpan(p);
  return p.notify.before.map(({ amount, unit }) => ({
    amount,
    unit,
    startsAt,
    fireAt: fireAt(p, startsAt, amount, unit, limits),
  }));
}

function fireAt(
  p: EventTimes,
  startsAt: Date,
  amount: number,
  unit: EventNoticeUnit,
  limits: MomentLimits,
): Date {
  if (p.allDay) {
    return instantOnDate(addDaysToIsoDate(p.start, -amount), p.timeZone, limits.allDayNoticeHour);
  }
  if (unit !== 'days') return new Date(startsAt.getTime() - amount * EVENT_UNIT_MS[unit]);
  const wall = wallClockAt(startsAt, p.timeZone);
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day - amount));
  return instantFromWallClock(
    {
      ...wall,
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    },
    p.timeZone,
  );
}

/** Stable key of one notify-before time (uniqueness, diffing). */
export const notifyBeforeKey = (b: NotifyBefore): string => `${b.amount}:${b.unit}`;
