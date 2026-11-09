import { describe, expect, it } from 'vitest';
import { eventNoticeMoments, notifyBeforeKey } from './moments';

const fireAts = (m: ReturnType<typeof eventNoticeMoments>) => m.map((x) => x.fireAt.toISOString());

describe('eventNoticeMoments', () => {
  it('subtracts exact minutes and hours', () => {
    const m = eventNoticeMoments({
      allDay: false,
      start: '2026-12-03T18:00:00+02:00',
      timeZone: 'Asia/Jerusalem',
      notify: {
        before: [
          { amount: 0, unit: 'minutes' },
          { amount: 30, unit: 'minutes' },
          { amount: 2, unit: 'hours' },
        ],
      },
    });
    expect(fireAts(m)).toEqual([
      '2026-12-03T16:00:00.000Z',
      '2026-12-03T15:30:00.000Z',
      '2026-12-03T14:00:00.000Z',
    ]);
    expect(m[0].startsAt.toISOString()).toBe('2026-12-03T16:00:00.000Z');
  });

  it('keeps the wall-clock time across DST for days', () => {
    // Start Mon 30 Mar 2026 09:00 BST; a day before is Sun 29 Mar 09:00 BST (spring-forward day).
    const days = eventNoticeMoments({
      allDay: false,
      start: '2026-03-30T09:00:00+01:00',
      timeZone: 'Europe/London',
      notify: {
        before: [
          { amount: 1, unit: 'days' },
          { amount: 2, unit: 'days' },
        ],
      },
    });
    expect(fireAts(days)).toEqual(['2026-03-29T08:00:00.000Z', '2026-03-28T09:00:00.000Z']);
  });

  it('fires all-day notices at the notice hour in the zone', () => {
    const m = eventNoticeMoments({
      allDay: true,
      start: '2026-12-03',
      timeZone: 'Asia/Jerusalem',
      notify: {
        before: [
          { amount: 0, unit: 'days' },
          { amount: 7, unit: 'days' },
        ],
      },
    });
    expect(fireAts(m)).toEqual(['2026-12-03T07:00:00.000Z', '2026-11-26T07:00:00.000Z']);
  });

  it('honours a lowered notice hour', () => {
    const m = eventNoticeMoments(
      {
        allDay: true,
        start: '2026-12-03',
        timeZone: 'UTC',
        notify: { before: [{ amount: 1, unit: 'days' }] },
      },
      { allDayNoticeHour: 6 },
    );
    expect(fireAts(m)).toEqual(['2026-12-02T06:00:00.000Z']);
  });

  it('keys a notify time', () => {
    expect(notifyBeforeKey({ amount: 2, unit: 'hours' })).toBe('2:hours');
  });
});
