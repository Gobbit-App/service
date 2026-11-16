import { instantFromWallClock, parseIsoDate, wallClockAt } from '../event-time/zoned';
import { eventSpan, type EventTimes } from './span';

/**
 * D402: yearly repeats. `start`/`end` always hold the current or next occurrence. An occurrence
 * counts as over once its span ends (`endsAt <= now`, the same instant the reader and the sweep use).
 */

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** 29 Feb moves to 28 Feb in a non-leap year; every other day is kept. */
const clampDay = (year: number, month: number, day: number): number =>
  month === 2 && day === 29 && !isLeap(year) ? 28 : day;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `YYYY-MM-DD` + `years` (all-day). */
function shiftDate(value: string, years: number): string {
  const p = parseIsoDate(value);
  if (!p) throw new RangeError(`Not a date: ${value}`);
  const year = p.year + years;
  const day = clampDay(year, p.month, p.day);
  return `${pad(year, 4)}-${pad(p.month)}-${pad(day)}`;
}

/** An instant + `years` on the same wall clock in `timeZone` (timed). */
function shiftInstant(value: string, timeZone: string, years: number): string {
  const w = wallClockAt(new Date(value), timeZone);
  const year = w.year + years;
  const day = clampDay(year, w.month, w.day);
  return instantFromWallClock({ ...w, year, day }, timeZone).toISOString();
}

function shiftBy(p: EventTimes, years: number): Pick<EventTimes, 'start' | 'end'> {
  const shift = (value: string) =>
    p.allDay ? shiftDate(value, years) : shiftInstant(value, p.timeZone, years);
  return {
    start: shift(p.start),
    ...(p.end !== undefined ? { end: shift(p.end) } : {}),
  };
}

/** Whole years to add so the occurrence is still ongoing or upcoming; 0 when it needs none. */
function yearsToNext(p: EventTimes, now: Date): number {
  if (p.repeat !== 'yearly' || eventSpan(p).endsAt > now) return 0;
  let years = 1;
  while (eventSpan({ ...p, ...shiftBy(p, years) }).endsAt <= now) years += 1;
  return years;
}

/**
 * D402: the payload with `start`/`end` moved to the current or next yearly occurrence. Returns `p`
 * itself when it doesn't repeat or its occurrence hasn't ended. Other fields are copied unchanged.
 */
export function nextOccurrence<T extends EventTimes>(p: T, now: Date): T {
  const years = yearsToNext(p, now);
  if (years === 0) return p;
  return { ...p, ...shiftBy(p, years) };
}

/** D402: how many years `nextOccurrence` moves the payload (0 when it doesn't). */
export function occurrenceYearsBehind(p: EventTimes, now: Date): number {
  return yearsToNext(p, now);
}
