import { addDaysToIsoDate } from '../event-time/zoned';
import { EVENT_DEFAULT_LENGTH_MS } from '../events-cards/constants';

/** 042 (D368): what a calendar file needs from an event card (zod-free). */
export interface IcsEvent {
  /** The item id, used for a stable `UID`. */
  id: string;
  title: string;
  allDay: boolean;
  /** Timed: an ISO instant. All-day: `YYYY-MM-DD`. */
  start: string;
  /** Timed: an ISO instant. All-day: the last day, inclusive. */
  end?: string;
  timeZone: string;
  location?: string;
  /** The event's own link. */
  url?: string;
}

export interface IcsOptions {
  /** The card's address in Gobbit (`URL` and the first description line). */
  cardUrl: string;
  /** `DTSTAMP`. */
  now: Date;
}

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const encoder = new TextEncoder();

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: lines longer than 75 octets continue on the next line after CRLF + one space.
 * Splits between code points, never inside a UTF-8 sequence.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYYMMDDTHHMMSSZ` */
function utcStamp(instant: Date): string {
  return (
    `${instant.getUTCFullYear()}${pad(instant.getUTCMonth() + 1)}${pad(instant.getUTCDate())}` +
    `T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}${pad(instant.getUTCSeconds())}Z`
  );
}

const dateValue = (isoDate: string) => isoDate.replace(/-/g, '');

function timeLines(event: IcsEvent): string[] {
  if (event.allDay) {
    // DTEND is exclusive for DATE values: the day after the last day.
    const lastDay = event.end ?? event.start;
    return [
      `DTSTART;VALUE=DATE:${dateValue(event.start)}`,
      `DTEND;VALUE=DATE:${dateValue(addDaysToIsoDate(lastDay, 1))}`,
    ];
  }
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + EVENT_DEFAULT_LENGTH_MS);
  return [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];
}

function description(event: IcsEvent, cardUrl: string): string {
  const lines = [cardUrl];
  if (event.url) lines.push(event.url);
  // UTC instants import as the right moment everywhere; the event's own clock is kept as text.
  if (!event.allDay) lines.push(`Time zone: ${event.timeZone}`);
  return lines.join('\n');
}

/** D368: one `VEVENT` in a `VCALENDAR`, CRLF line endings, folded at 75 octets. */
export function toIcs(event: IcsEvent, { cardUrl, now }: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gobbit//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@gobbit`,
    `DTSTAMP:${utcStamp(now)}`,
    ...timeLines(event),
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push(`URL:${cardUrl}`);
  lines.push(`DESCRIPTION:${escapeIcsText(description(event, cardUrl))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/** A file name for the download: the title without path or reserved characters. */
export function icsFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${safe || 'event'}.ics`;
}
