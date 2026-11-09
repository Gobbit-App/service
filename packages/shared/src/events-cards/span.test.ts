import { describe, expect, it } from 'vitest';
import { eventSpan } from './span';

const iso = (s: { startsAt: Date; endsAt: Date }) => ({
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
});

describe('eventSpan', () => {
  it('uses the explicit end of a timed event', () => {
    expect(
      iso(
        eventSpan({
          allDay: false,
          start: '2026-12-03T18:00:00+02:00',
          end: '2026-12-03T20:30:00+02:00',
          timeZone: 'Asia/Jerusalem',
        }),
      ),
    ).toEqual({ startsAt: '2026-12-03T16:00:00.000Z', endsAt: '2026-12-03T18:30:00.000Z' });
  });

  it('lasts an hour without an end', () => {
    expect(
      iso(eventSpan({ allDay: false, start: '2026-12-03T18:00:00Z', timeZone: 'UTC' })),
    ).toEqual({ startsAt: '2026-12-03T18:00:00.000Z', endsAt: '2026-12-03T19:00:00.000Z' });
  });

  it('covers whole days in the zone for all-day events', () => {
    expect(
      iso(
        eventSpan({
          allDay: true,
          start: '2026-12-03',
          end: '2026-12-04',
          timeZone: 'Asia/Jerusalem',
        }),
      ),
    ).toEqual({ startsAt: '2026-12-02T22:00:00.000Z', endsAt: '2026-12-04T22:00:00.000Z' });
  });

  it('is one day without an end, DST-aware', () => {
    // London springs forward on 2026-03-29: that day is 23 h long.
    const s = eventSpan({ allDay: true, start: '2026-03-29', timeZone: 'Europe/London' });
    expect(iso(s)).toEqual({
      startsAt: '2026-03-29T00:00:00.000Z',
      endsAt: '2026-03-29T23:00:00.000Z',
    });
  });
});
