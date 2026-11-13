import { describe, expect, it } from 'vitest';
import { formatEventAbsolute, formatEventStatus, formatEventWhen, zoneCity } from './format';
import type { EventSpan } from './phase';

const TZ = 'Asia/Jerusalem';
const timed: EventSpan = {
  startsAt: '2026-12-03T16:00:00Z',
  endsAt: '2026-12-03T18:00:00Z',
  allDay: false,
  timeZone: TZ,
};
const allDay: EventSpan = {
  startsAt: '2026-12-02T22:00:00Z',
  endsAt: '2026-12-04T22:00:00Z',
  allDay: true,
  timeZone: TZ,
};
const oneDay: EventSpan = { ...allDay, endsAt: '2026-12-03T22:00:00Z' };
const now = new Date('2026-11-09T10:00:00Z');

describe('formatEventWhen', () => {
  it('formats a timed event in the viewer zone', () => {
    expect(formatEventWhen(timed, TZ, { now })).toEqual({
      date: 'Thu 3 Dec',
      time: '18:00',
      until: '20:00',
      range: 'Thu 3 Dec, 18:00–20:00',
      zoneNote: null,
    });
  });

  it("notes the event's zone when the viewer's clock differs", () => {
    const w = formatEventWhen(timed, 'Europe/London', { now });
    expect(w.time).toBe('16:00');
    expect(w.zoneNote).toBe('18:00 Jerusalem time');
  });

  it('hides the default end unless asked', () => {
    expect(formatEventWhen(timed, TZ, { hasEnd: false }).until).toBeNull();
    expect(formatEventWhen(timed, TZ, { hasEnd: false, showDefaultEnd: true }).until).toBe('20:00');
  });

  it('formats all-day ranges and single days', () => {
    expect(formatEventWhen(allDay, 'America/New_York', { now }).range).toBe('Thu 3 – Fri 4 Dec');
    expect(formatEventWhen(oneDay, TZ, { now }).range).toBe('Thu 3 Dec');
  });

  it('adds the year outside the current one', () => {
    const next: EventSpan = {
      ...timed,
      startsAt: '2027-01-05T16:00:00Z',
      endsAt: '2027-01-05T17:00:00Z',
    };
    expect(formatEventWhen(next, TZ, { now }).date).toBe('Tue 5 Jan 2027');
  });
});

describe('formatEventAbsolute', () => {
  it('names the zone for timed events', () => {
    expect(formatEventAbsolute(timed)).toBe('Thu 3 Dec, 18:00–20:00 (Asia/Jerusalem)');
    expect(formatEventAbsolute(allDay)).toBe('Thu 3 – Fri 4 Dec');
  });
});

describe('formatEventStatus', () => {
  it.each([
    ['2026-11-30T10:00:00Z', 'In 3 days · Thu 3 Dec, 18:00'],
    ['2026-12-02T10:00:00Z', 'Tomorrow · 18:00'],
    ['2026-12-03T08:00:00Z', 'Today · 18:00'],
    ['2026-12-03T17:00:00Z', 'Happening now · until 20:00'],
    ['2026-12-04T08:00:00Z', 'Ended · Thu 3 Dec'],
    ['2026-11-09T10:00:00Z', 'Thu 3 Dec, 18:00'],
  ])('at %s → %s', (at, text) => {
    expect(formatEventStatus(timed, new Date(at), TZ)).toBe(text);
  });
});

describe('zoneCity', () => {
  it('takes the last part of the zone name', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity('UTC')).toBe('UTC');
  });
});
