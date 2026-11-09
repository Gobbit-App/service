import { describe, expect, it } from 'vitest';
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  instantFromWallClock,
  instantOnDate,
  isIsoDate,
  isoDateIn,
  wallClockAt,
  zoneOffsetMs,
} from './zoned';

const wall = (y: number, mo: number, d: number, h = 0, mi = 0) => ({
  year: y,
  month: mo,
  day: d,
  hour: h,
  minute: mi,
  second: 0,
});

describe('wallClockAt / zoneOffsetMs', () => {
  it('reads the wall clock in a zone', () => {
    expect(wallClockAt(new Date('2026-12-03T16:00:00Z'), 'Asia/Jerusalem')).toEqual(
      wall(2026, 12, 3, 18),
    );
  });

  it('knows the offset on both sides of DST', () => {
    expect(zoneOffsetMs(Date.parse('2026-01-15T12:00:00Z'), 'Europe/London')).toBe(0);
    expect(zoneOffsetMs(Date.parse('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(3_600_000);
  });
});

describe('instantFromWallClock', () => {
  it('converts an ordinary wall clock', () => {
    expect(instantFromWallClock(wall(2026, 12, 3, 18), 'Asia/Jerusalem').toISOString()).toBe(
      '2026-12-03T16:00:00.000Z',
    );
  });

  it('resolves an ambiguous fall-back time to its first occurrence', () => {
    // London 2026-10-25 01:30 happens twice (BST then GMT).
    expect(instantFromWallClock(wall(2026, 10, 25, 1, 30), 'Europe/London').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('uses the offset before the change inside a spring-forward gap (as PostgreSQL)', () => {
    // London 2026-03-29 01:30 doesn't exist; GMT (before) → 01:30Z.
    expect(instantFromWallClock(wall(2026, 3, 29, 1, 30), 'Europe/London').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });
});

describe('date helpers', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reads the date in a zone', () => {
    expect(isoDateIn(new Date('2026-12-03T23:30:00Z'), 'Asia/Jerusalem')).toBe('2026-12-04');
    expect(isoDateIn(new Date('2026-12-03T23:30:00Z'), 'UTC')).toBe('2026-12-03');
  });

  it('places an hour on a date in a zone', () => {
    expect(instantOnDate('2026-12-03', 'Asia/Jerusalem', 9).toISOString()).toBe(
      '2026-12-03T07:00:00.000Z',
    );
  });

  it('counts days between dates', () => {
    expect(daysBetweenIsoDates('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetweenIsoDates('2026-03-30', '2026-03-28')).toBe(-2);
  });
});
