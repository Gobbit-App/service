import { describe, expect, it } from 'vitest';
import { eventPhase, type EventSpan } from './phase';

const TZ = 'Asia/Jerusalem';
const timed: EventSpan = {
  startsAt: '2026-12-03T16:00:00Z', // 18:00 Jerusalem
  endsAt: '2026-12-03T18:00:00Z',
  allDay: false,
  timeZone: TZ,
};
// All-day 3–4 Dec in Jerusalem.
const allDay: EventSpan = {
  startsAt: '2026-12-02T22:00:00Z',
  endsAt: '2026-12-04T22:00:00Z',
  allDay: true,
  timeZone: TZ,
};

const at = (iso: string) => new Date(iso);

describe('eventPhase (timed)', () => {
  it.each([
    ['2026-11-28T10:00:00Z', 'upcoming', 5],
    ['2026-12-02T10:00:00Z', 'tomorrow', 1],
    ['2026-12-03T08:00:00Z', 'today', 0],
    ['2026-12-03T17:00:00Z', 'now', 0],
    ['2026-12-03T18:00:00Z', 'ended', 0],
  ])('at %s is %s', (now, phase, days) => {
    const r = eventPhase(timed, at(now), TZ);
    expect(r.phase).toBe(phase);
    expect(r.days).toBe(days);
  });

  it("counts days in the viewer's calendar", () => {
    // 2026-12-02 23:30 London is already 3 Dec in Jerusalem, but still 2 Dec for the viewer.
    expect(eventPhase(timed, at('2026-12-02T23:30:00Z'), 'Europe/London').phase).toBe('tomorrow');
  });
});

describe('eventPhase (all-day)', () => {
  it.each([
    ['2026-12-01T10:00:00Z', 'upcoming'],
    ['2026-12-02T10:00:00Z', 'tomorrow'],
    ['2026-12-03T10:00:00Z', 'today'],
    ['2026-12-04T10:00:00Z', 'today'],
    ['2026-12-05T10:00:00Z', 'ended'],
  ])('at %s is %s', (now, phase) => {
    expect(eventPhase(allDay, at(now), TZ).phase).toBe(phase);
  });

  it('shows the same dates to a viewer in another zone', () => {
    expect(eventPhase(allDay, at('2026-12-03T12:00:00Z'), 'America/New_York').phase).toBe('today');
  });
});
