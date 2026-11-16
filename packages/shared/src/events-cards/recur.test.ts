import { describe, expect, it } from 'vitest';
import { nextOccurrence, occurrenceYearsBehind } from './recur';
import type { EventTimes } from './span';

const NOW = new Date('2026-11-15T10:00:00Z');

describe('nextOccurrence (D402)', () => {
  it('rolls an ended all-day yearly event to its next date', () => {
    const p: EventTimes = {
      allDay: true,
      start: '2025-12-01',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, NOW)).toEqual({
      allDay: true,
      start: '2026-12-01',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    });
  });

  it('keeps an ongoing all-day occurrence unchanged', () => {
    const p: EventTimes = {
      allDay: true,
      start: '2026-12-01',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, new Date('2026-12-01T10:00:00Z'))).toBe(p);
  });

  it('shifts a multi-day all-day end too', () => {
    const p: EventTimes = {
      allDay: true,
      start: '2025-12-01',
      end: '2025-12-03',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, NOW)).toMatchObject({ start: '2026-12-01', end: '2026-12-03' });
  });

  it('rolls a timed yearly event keeping its wall clock in the zone', () => {
    const p: EventTimes = {
      allDay: false,
      start: '2024-12-01T16:00:00.000Z',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, NOW)).toMatchObject({ start: '2026-12-01T16:00:00.000Z' });
  });

  it('shifts the end of a timed event on its own wall clock', () => {
    const p: EventTimes = {
      allDay: false,
      start: '2025-12-01T16:00:00+02:00',
      end: '2025-12-01T20:00:00+02:00',
      timeZone: 'Europe/Athens',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, NOW)).toMatchObject({
      start: '2026-12-01T14:00:00.000Z',
      end: '2026-12-01T18:00:00.000Z',
    });
  });

  it('keeps the local wall clock across DST in a non-UTC zone', () => {
    // 2025-07-04 20:00 New York (EDT) is 2025-07-05T00:00Z.
    const p: EventTimes = {
      allDay: false,
      start: '2025-07-05T00:00:00.000Z',
      timeZone: 'America/New_York',
      repeat: 'yearly',
    };
    expect(nextOccurrence(p, new Date('2026-06-01T00:00:00Z'))).toMatchObject({
      start: '2026-07-05T00:00:00.000Z',
    });
  });

  it('moves 29 Feb to 28 Feb in a non-leap year', () => {
    const p: EventTimes = { allDay: true, start: '2024-02-29', timeZone: 'UTC', repeat: 'yearly' };
    expect(nextOccurrence(p, new Date('2024-03-10T00:00:00Z'))).toMatchObject({
      start: '2025-02-28',
    });
  });

  it('jumps several years to the first future occurrence', () => {
    const p: EventTimes = { allDay: true, start: '2020-12-01', timeZone: 'UTC', repeat: 'yearly' };
    expect(nextOccurrence(p, NOW)).toMatchObject({ start: '2026-12-01' });
  });

  it('returns a non-repeating ended event unchanged', () => {
    const p: EventTimes = { allDay: true, start: '2020-12-01', timeZone: 'UTC' };
    expect(nextOccurrence(p, NOW)).toBe(p);
  });
});

describe('occurrenceYearsBehind (D402)', () => {
  it('returns the number of years rolled', () => {
    const p: EventTimes = { allDay: true, start: '2020-12-01', timeZone: 'UTC', repeat: 'yearly' };
    expect(occurrenceYearsBehind(p, NOW)).toBe(6);
  });

  it('is 0 when not repeating or not ended', () => {
    const oneOff: EventTimes = { allDay: true, start: '2020-12-01', timeZone: 'UTC' };
    const ongoing: EventTimes = {
      allDay: true,
      start: '2026-12-01',
      timeZone: 'UTC',
      repeat: 'yearly',
    };
    expect(occurrenceYearsBehind(oneOff, NOW)).toBe(0);
    expect(occurrenceYearsBehind(ongoing, NOW)).toBe(0);
  });
});
