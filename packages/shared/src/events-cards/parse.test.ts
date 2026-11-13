import { describe, expect, it } from 'vitest';
import { parseEventSpan, parseEventStart } from './parse';

describe('parseEventStart (D370)', () => {
  it('reads a date alone as all day', () => {
    expect(parseEventStart('2026-12-03', 'Europe/London')).toEqual({
      allDay: true,
      date: '2026-12-03',
    });
  });

  it('reads a date and time with an offset as that instant', () => {
    expect(parseEventStart('2026-12-03T18:00:00+02:00', 'UTC')).toEqual({
      allDay: false,
      instant: '2026-12-03T16:00:00.000Z',
    });
    expect(parseEventStart('2026-12-03T18:00Z', 'Asia/Tokyo')).toEqual({
      allDay: false,
      instant: '2026-12-03T18:00:00.000Z',
    });
    expect(parseEventStart('2026-12-03T18:00:00-0500', 'UTC')).toEqual({
      allDay: false,
      instant: '2026-12-03T23:00:00.000Z',
    });
  });

  it('reads a local date and time in the given zone', () => {
    expect(parseEventStart('2026-12-03T18:00', 'Europe/Berlin')).toEqual({
      allDay: false,
      instant: '2026-12-03T17:00:00.000Z',
    });
    expect(parseEventStart('2026-07-03 18:00:00', 'Europe/Berlin')).toEqual({
      allDay: false,
      instant: '2026-07-03T16:00:00.000Z',
    });
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'next Thursday', '2026-02-30', '2026-12-03T25:00', '3/12/2026']) {
      expect(parseEventStart(bad, 'UTC'), bad).toBeNull();
    }
  });
});

describe('parseEventSpan (D370)', () => {
  it('needs a start', () => {
    expect(parseEventSpan(undefined, '2026-12-03', 'UTC')).toEqual({
      ok: false,
      reason: 'no_start',
    });
    expect(parseEventSpan('soon', null, 'UTC')).toEqual({ ok: false, reason: 'no_start' });
  });

  it('keeps a later timed end and refuses an earlier or equal one', () => {
    expect(parseEventSpan('2026-12-03T18:00Z', '2026-12-03T20:00Z', 'UTC')).toEqual({
      ok: true,
      span: {
        allDay: false,
        start: '2026-12-03T18:00:00.000Z',
        end: '2026-12-03T20:00:00.000Z',
      },
    });
    expect(parseEventSpan('2026-12-03T18:00Z', '2026-12-03T18:00Z', 'UTC')).toEqual({
      ok: false,
      reason: 'end_before_start',
    });
  });

  it('drops a date-only end on a timed event and an unreadable end', () => {
    expect(parseEventSpan('2026-12-03T18:00Z', '2026-12-04', 'UTC')).toEqual({
      ok: true,
      span: { allDay: false, start: '2026-12-03T18:00:00.000Z' },
    });
    expect(parseEventSpan('2026-12-03', 'later', 'UTC')).toEqual({
      ok: true,
      span: { allDay: true, start: '2026-12-03' },
    });
  });

  it('keeps the end date of an all-day event, inclusive', () => {
    expect(parseEventSpan('2026-12-03', '2026-12-05', 'UTC')).toEqual({
      ok: true,
      span: { allDay: true, start: '2026-12-03', end: '2026-12-05' },
    });
    expect(parseEventSpan('2026-12-03', '2026-12-04T01:00:00+00:00', 'Asia/Tokyo')).toEqual({
      ok: true,
      span: { allDay: true, start: '2026-12-03', end: '2026-12-04' },
    });
    expect(parseEventSpan('2026-12-03', '2026-12-03', 'UTC')).toEqual({
      ok: true,
      span: { allDay: true, start: '2026-12-03' },
    });
    expect(parseEventSpan('2026-12-03', '2026-12-02', 'UTC')).toEqual({
      ok: false,
      reason: 'end_before_start',
    });
  });
});
