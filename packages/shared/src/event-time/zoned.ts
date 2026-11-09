/**
 * D357/D359: wall-clock ↔ instant conversion in an IANA zone with `Intl` only (zod-free, no tz data
 * of our own). Used by event spans, notice moments and the status line.
 */

export interface WallClock {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MINUTE_MS = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at `instant`. */
export function wallClockAt(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const wallAsUtc = (w: WallClock): number =>
  Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** Offset of `timeZone` from UTC at `instant`, in ms (whole minutes). */
export function zoneOffsetMs(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / 1000) * 1000;
  const diff = wallAsUtc(wallClockAt(new Date(floored), timeZone)) - floored;
  return Math.round(diff / MINUTE_MS) * MINUTE_MS;
}

const sameWall = (a: WallClock, b: WallClock): boolean =>
  a.year === b.year &&
  a.month === b.month &&
  a.day === b.day &&
  a.hour === b.hour &&
  a.minute === b.minute &&
  a.second === b.second;

const DAY_MS = 86_400_000;

/**
 * The instant a wall clock in `timeZone` shows `wall`. Around a DST change the offset in force before
 * the change wins, as PostgreSQL's `timestamp AT TIME ZONE` does (the `event_cards` trigger, D358): an
 * ambiguous fall-back time is its first occurrence, a time in a spring-forward gap is read with the
 * old offset. Zone changes are assumed to be more than a day apart.
 */
export function instantFromWallClock(wall: WallClock, timeZone: string): Date {
  const asUtc = wallAsUtc(wall);
  const before = zoneOffsetMs(asUtc - DAY_MS, timeZone);
  const offsets = [before, zoneOffsetMs(asUtc, timeZone), zoneOffsetMs(asUtc + DAY_MS, timeZone)];
  const candidates = offsets
    .map((o) => asUtc - o)
    .filter((t) => sameWall(wallClockAt(new Date(t), timeZone), wall));
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // DST gap: the offset before the transition.
  return new Date(asUtc - before);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → its parts, or null when it isn't a real calendar date. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** True for a real `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Calendar arithmetic on `YYYY-MM-DD` (no zone involved). */
export function addDaysToIsoDate(value: string, days: number): string {
  const p = parseIsoDate(value);
  if (!p) throw new RangeError(`Not a date: ${value}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The calendar date (`YYYY-MM-DD`) in `timeZone` at `instant`. */
export function isoDateIn(instant: Date, timeZone: string): string {
  const w = wallClockAt(instant, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** 00:00 + `hour` on `date` in `timeZone`. */
export function instantOnDate(date: string, timeZone: string, hour = 0): Date {
  const p = parseIsoDate(date);
  if (!p) throw new RangeError(`Not a date: ${date}`);
  return instantFromWallClock({ ...p, hour, minute: 0, second: 0 }, timeZone);
}

/** Whole calendar days from `from` to `to` (`YYYY-MM-DD`). */
export function daysBetweenIsoDates(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) throw new RangeError('Not a date');
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}
