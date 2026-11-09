import { allDayDates, eventPhase, type EventSpan } from './phase';
import { parseIsoDate, wallClockAt, zoneOffsetMs } from './zoned';

const LOCALE = 'en-GB';
const formatCache = new Map<string, Intl.DateTimeFormat>();

function fmt(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, options);
    formatCache.set(key, f);
  }
  return f;
}

const toDate = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d);

/** "Thu 3 Dec" (plus the year when it isn't `currentYear`). */
function dateLabel(instant: Date, timeZone: string, currentYear?: number): string {
  const withYear = currentYear !== undefined && wallClockAt(instant, timeZone).year !== currentYear;
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  };
  return fmt(`d|${timeZone}|${withYear}`, options).format(instant).replace(/,/g, '');
}

/** "18:00". */
function timeLabel(instant: Date, timeZone: string): string {
  return fmt(`t|${timeZone}`, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** A calendar date (`YYYY-MM-DD`) as "Thu 3 Dec"; dates carry no zone (D357). */
function isoDateLabel(date: string, currentYear?: number): string {
  const p = parseIsoDate(date);
  if (!p) return date;
  return dateLabel(new Date(Date.UTC(p.year, p.month - 1, p.day, 12)), 'UTC', currentYear);
}

/** "Asia/Jerusalem" → "Jerusalem". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}

export interface EventWhen {
  /** Start date as the viewer reads it ("Thu 3 Dec"). */
  date: string;
  /** Start time in the viewer's zone; null for all-day events. */
  time: string | null;
  /** End as shown after the start ("20:00", "Fri 4 Dec, 02:00", "Sat 5 Dec"); null when none. */
  until: string | null;
  /** The whole span: "Thu 3 Dec, 18:00–20:00", "Thu 3 – Sat 5 Dec". */
  range: string;
  /** "16:00 Jerusalem time" when the event's zone shows a different time; null otherwise. */
  zoneNote: string | null;
}

export interface FormatOptions {
  /** Adds the year to dates outside the current year. */
  now?: Date;
  /** Whether a timed event without an explicit end shows its default end (default false). */
  showDefaultEnd?: boolean;
  /** Set when the payload had no `end` (the span then ends after the default length). */
  hasEnd?: boolean;
}

/**
 * D367: an event's date and time for a viewer. Timed events are shown in `viewerTimeZone` with the
 * event's zone noted when its clock differs; all-day events show their own dates to everyone.
 * Public pages call it with the event's own zone (absolute form only).
 */
export function formatEventWhen(
  span: EventSpan,
  viewerTimeZone: string,
  options: FormatOptions = {},
): EventWhen {
  const currentYear = options.now ? wallClockAt(options.now, viewerTimeZone).year : undefined;

  if (span.allDay) {
    const { first, last } = allDayDates(span);
    const date = isoDateLabel(first, currentYear);
    if (first === last) return { date, time: null, until: null, range: date, zoneNote: null };
    const lastLabel = isoDateLabel(last, currentYear);
    const [fy, fm] = first.split('-');
    const [ly, lm] = last.split('-');
    const shortFirst =
      fy === ly && fm === lm ? date.replace(/\s\S+(\s\d{4})?$/, '') : date.replace(/\s\d{4}$/, '');
    const range = fy === ly ? `${shortFirst} – ${lastLabel}` : `${date} – ${lastLabel}`;
    return { date, time: null, until: lastLabel, range, zoneNote: null };
  }

  const start = toDate(span.startsAt);
  const end = toDate(span.endsAt);
  const date = dateLabel(start, viewerTimeZone, currentYear);
  const time = timeLabel(start, viewerTimeZone);
  const showEnd = options.hasEnd !== false || options.showDefaultEnd === true;
  let until: string | null = null;
  if (showEnd) {
    const sameDay = dateLabel(end, viewerTimeZone) === dateLabel(start, viewerTimeZone);
    until = sameDay
      ? timeLabel(end, viewerTimeZone)
      : `${dateLabel(end, viewerTimeZone, currentYear)}, ${timeLabel(end, viewerTimeZone)}`;
  }
  const range = until ? `${date}, ${time}–${until}` : `${date}, ${time}`;
  const differs =
    viewerTimeZone !== span.timeZone &&
    zoneOffsetMs(start.getTime(), viewerTimeZone) !== zoneOffsetMs(start.getTime(), span.timeZone);
  const zoneNote = differs
    ? `${timeLabel(start, span.timeZone)} ${zoneCity(span.timeZone)} time`
    : null;
  return { date, time, until, range, zoneNote };
}

/** "Thu 3 Dec, 18:00–20:00 (Asia/Jerusalem)" / "Thu 3 – Sat 5 Dec": public pages, share previews, push. */
export function formatEventAbsolute(span: EventSpan, options: FormatOptions = {}): string {
  const when = formatEventWhen(span, span.timeZone, options);
  return span.allDay ? when.range : `${when.range} (${span.timeZone})`;
}

/** D367: the card's status line ("In 3 days · Thu 3 Dec, 18:00", "Happening now · until 20:00"). */
export function formatEventStatus(
  span: EventSpan,
  now: Date,
  viewerTimeZone: string,
  options: FormatOptions = {},
): string {
  const { phase, days } = eventPhase(span, now, viewerTimeZone);
  const when = formatEventWhen(span, viewerTimeZone, { ...options, now });
  const at = when.time ?? when.range;
  switch (phase) {
    case 'ended':
      return `Ended · ${when.date}`;
    case 'now':
      return when.until ? `Happening now · until ${when.until}` : 'Happening now';
    case 'today':
      return span.allDay ? `Today · ${when.range}` : `Today · ${at}`;
    case 'tomorrow':
      return span.allDay ? `Tomorrow · ${when.range}` : `Tomorrow · ${at}`;
    default:
      return days > 7
        ? span.allDay
          ? when.range
          : `${when.date}, ${at}`
        : span.allDay
          ? `In ${days} days · ${when.range}`
          : `In ${days} days · ${when.date}, ${at}`;
  }
}
