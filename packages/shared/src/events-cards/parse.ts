import { instantFromWallClock, isIsoDate, isoDateIn, parseIsoDate } from '../event-time/zoned';

/**
 * D370: reading a start or end found in a share (schema.org `startDate`, or the model's answer).
 * A date alone is an all-day value; a date and time with an offset is that instant; a local date and
 * time with no offset is read in `timeZone` (the sharer's zone, else the default, D374).
 */
export type ParsedEventTime = { allDay: true; date: string } | { allDay: false; instant: string };

const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/;
const OFFSET_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

function validClock(hour: number, minute: number, second: number): boolean {
  return hour <= 23 && minute <= 59 && second <= 59;
}

export function parseEventStart(value: string, timeZone: string): ParsedEventTime | null {
  const v = value.trim();
  if (isIsoDate(v)) return { allDay: true, date: v };

  const offset = OFFSET_RE.exec(v);
  if (offset) {
    const [, date, h, m, s] = offset;
    if (!isIsoDate(date) || !validClock(Number(h), Number(m), Number(s ?? 0))) return null;
    const zone = offset[5].toUpperCase();
    const normalizedZone = zone === 'Z' ? 'Z' : zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
    const iso = `${date}T${h}:${m}:${s ?? '00'}${normalizedZone}`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : { allDay: false, instant: new Date(t).toISOString() };
  }

  const local = LOCAL_RE.exec(v);
  if (local) {
    const [, date, h, m, s] = local;
    const day = parseIsoDate(date);
    const [hour, minute, second] = [Number(h), Number(m), Number(s ?? 0)];
    if (!day || !validClock(hour, minute, second)) return null;
    const instant = instantFromWallClock({ ...day, hour, minute, second }, timeZone);
    return { allDay: false, instant: instant.toISOString() };
  }
  return null;
}

/** The event times a share proposes, in `eventPayloadSchema` form. */
export interface ParsedEventSpan {
  allDay: boolean;
  start: string;
  end?: string;
}

export type EventSpanResult =
  { ok: true; span: ParsedEventSpan } | { ok: false; reason: 'no_start' | 'end_before_start' };

/**
 * D370: a start (required) and an optional end. An end that can't be read is dropped. An all-day
 * start with a timed end keeps the end's date in the zone (the end date is inclusive); a timed start
 * with a date-only end drops the end. An end before the start (or equal, when timed) fails.
 */
export function parseEventSpan(
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone: string,
): EventSpanResult {
  const s = start ? parseEventStart(start, timeZone) : null;
  if (!s) return { ok: false, reason: 'no_start' };
  const e = end ? parseEventStart(end, timeZone) : null;

  if (s.allDay) {
    const endDate = e ? (e.allDay ? e.date : isoDateIn(new Date(e.instant), timeZone)) : undefined;
    if (endDate !== undefined && endDate < s.date) return { ok: false, reason: 'end_before_start' };
    const span: ParsedEventSpan = { allDay: true, start: s.date };
    if (endDate !== undefined && endDate !== s.date) span.end = endDate;
    return { ok: true, span };
  }

  const span: ParsedEventSpan = { allDay: false, start: s.instant };
  if (e && !e.allDay) {
    if (Date.parse(e.instant) <= Date.parse(s.instant)) {
      return { ok: false, reason: 'end_before_start' };
    }
    span.end = e.instant;
  }
  return { ok: true, span };
}
