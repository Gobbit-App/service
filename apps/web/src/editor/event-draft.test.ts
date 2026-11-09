import { describe, expect, it } from 'vitest';
import {
  checkEvent,
  END_BEFORE_START,
  eventDraftFromPayload,
  eventToPayload,
  LOCATION_TOO_LONG,
  maxNoticeAmount,
  newEventPayload,
  noticeLabel,
  notifySummary,
  pastNoticeLabels,
  START_REQUIRED,
  START_TOO_FAR,
  TIMES_DUPLICATE,
  timesUnchanged,
  withAllDay,
  type EventDraftPayload,
} from './event-draft';
import { PEOPLE_REQUIRED, deviceTimeZone, localInputToIso } from './reminder-draft';
import type { FieldErrors } from './validate';

const NOW = new Date(2026, 10, 3, 14, 30);

const check = (p: EventDraftPayload, now = NOW): FieldErrors => {
  const errors: FieldErrors = {};
  checkEvent(p, errors, now);
  return errors;
};

const stored = {
  allDay: false,
  start: '2026-12-01T17:00:00.000Z',
  end: '2026-12-01T19:00:00.000Z',
  timeZone: 'Pacific/Auckland',
  location: 'Town hall',
  url: 'https://example.org/fair',
  preview: { title: 'Fair', image: 'https://example.org/i.png' },
  notify: {
    before: [
      { amount: 1, unit: 'days' },
      { amount: 2, unit: 'hours' },
    ],
    audience: { mode: 'people', userIds: ['u1', 'u2'] },
  },
};

describe('event draft (042)', () => {
  it('a new event starts tomorrow at 18:00, timed, no end, notifying everyone a day before', () => {
    const p = newEventPayload(NOW);
    expect(p).toMatchObject({
      allDay: false,
      start: '2026-11-04T18:00',
      end: '',
      timeZone: deviceTimeZone(),
      stored: null,
      location: '',
      url: '',
      notify: { before: [{ amount: '1', unit: 'days' }], audience: { mode: 'everyone' } },
    });
    expect(check(p)).toEqual({});
  });

  it('reads a stored payload and sends untouched times back unchanged (zone included)', () => {
    const p = eventDraftFromPayload(stored);
    expect(p.stored).toEqual({
      allDay: false,
      start: stored.start,
      end: stored.end,
      timeZone: 'Pacific/Auckland',
    });
    expect(timesUnchanged(p)).toBe(true);
    expect(p.notify.before).toEqual([
      { amount: '1', unit: 'days' },
      { amount: '2', unit: 'hours' },
    ]);
    expect(eventToPayload(p)).toEqual({
      allDay: false,
      start: stored.start,
      end: stored.end,
      timeZone: 'Pacific/Auckland',
      location: 'Town hall',
      url: 'https://example.org/fair',
      preview: { title: 'Fair', image: 'https://example.org/i.png' },
      notify: {
        before: [
          { amount: 1, unit: 'days' },
          { amount: 2, unit: 'hours' },
        ],
        audience: { mode: 'people', userIds: ['u1', 'u2'] },
      },
    });
  });

  it('changed times are sent in the device zone', () => {
    const p = { ...eventDraftFromPayload(stored), start: '2026-12-02T10:00', end: '' };
    expect(timesUnchanged(p)).toBe(false);
    const out = eventToPayload(p);
    expect(out).toMatchObject({
      start: localInputToIso('2026-12-02T10:00'),
      timeZone: deviceTimeZone(),
    });
    expect(out).not.toHaveProperty('end');
  });

  it('drops a blank location and link, and the preview without a link', () => {
    const p = { ...eventDraftFromPayload(stored), location: '  ', url: ' ' };
    const out = eventToPayload(p);
    expect(out).not.toHaveProperty('location');
    expect(out).not.toHaveProperty('url');
    expect(out).not.toHaveProperty('preview');
  });

  it('normalizes the link and sends user ids only for specific people', () => {
    const base = eventDraftFromPayload(stored);
    const p = {
      ...base,
      url: 'example.org',
      notify: { ...base.notify, audience: { mode: 'everyone' as const, userIds: ['u1'] } },
    };
    expect(eventToPayload(p)).toMatchObject({
      url: 'https://example.org',
      notify: { audience: { mode: 'everyone', userIds: [] } },
    });
  });

  it('all-day: switching keeps the dates, turns notices into days and drops duplicates', () => {
    const p: EventDraftPayload = {
      ...newEventPayload(NOW),
      start: '2026-11-10T18:00',
      end: '2026-11-10T20:00',
      notify: {
        before: [
          { amount: '1', unit: 'days' },
          { amount: '24', unit: 'hours' },
          { amount: '30', unit: 'minutes' },
        ],
        audience: { mode: 'everyone', userIds: [] },
      },
    };
    const allDay = withAllDay(p, true);
    expect(allDay).toMatchObject({ allDay: true, start: '2026-11-10', end: '' });
    // 24 hours and 30 minutes both round to 1 day, the same as the existing row.
    expect(allDay.notify.before).toEqual([{ amount: '1', unit: 'days' }]);
    expect(eventToPayload(allDay)).toMatchObject({ allDay: true, start: '2026-11-10' });
    expect(eventToPayload(allDay)).not.toHaveProperty('end');

    const timed = withAllDay({ ...allDay, end: '2026-11-12' }, false);
    expect(timed).toMatchObject({ allDay: false, start: '2026-11-10T18:00', end: '' });
    expect(withAllDay(timed, false)).toBe(timed);
  });

  it('all-day notices are always sent in days', () => {
    const p: EventDraftPayload = {
      ...withAllDay(newEventPayload(NOW), true),
      notify: {
        before: [{ amount: '2', unit: 'hours' }],
        audience: { mode: 'everyone', userIds: [] },
      },
    };
    expect(eventToPayload(p)).toMatchObject({ notify: { before: [{ amount: 2, unit: 'days' }] } });
  });

  it('requires a start and an end after it', () => {
    expect(check({ ...newEventPayload(NOW), start: '' })).toEqual({
      'payload.start': START_REQUIRED,
    });
    const p = { ...newEventPayload(NOW), end: '2026-11-04T18:00' };
    expect(check(p)).toEqual({ 'payload.end': END_BEFORE_START });
    const allDay = { ...withAllDay(newEventPayload(NOW), true) };
    expect(check({ ...allDay, end: allDay.start })).toEqual({});
    expect(check({ ...allDay, end: '2026-11-03' })).toEqual({ 'payload.end': END_BEFORE_START });
  });

  it('refuses a new start more than five years ahead but keeps a saved one', () => {
    const far = { ...newEventPayload(NOW), start: '2032-01-01T10:00' };
    expect(check(far)).toEqual({ 'payload.start': START_TOO_FAR });
    const saved = eventDraftFromPayload({
      ...stored,
      start: '2032-01-01T10:00:00.000Z',
      end: undefined,
    });
    expect(check(saved)).toEqual({});
  });

  it('limits the location to 200 characters', () => {
    expect(check({ ...newEventPayload(NOW), location: 'x'.repeat(201) })).toEqual({
      'payload.location': LOCATION_TOO_LONG,
    });
    expect(check({ ...newEventPayload(NOW), location: 'x'.repeat(200) })).toEqual({});
  });

  it('checks notify times: whole numbers, at most 365 days, no duplicates, people picked', () => {
    const base = newEventPayload(NOW);
    const p: EventDraftPayload = {
      ...base,
      notify: {
        before: [
          { amount: '1.5', unit: 'hours' },
          { amount: '366', unit: 'days' },
          { amount: '1', unit: 'days' },
          { amount: '1', unit: 'days' },
        ],
        audience: { mode: 'people', userIds: [] },
      },
    };
    expect(check(p)).toEqual({
      'payload.notify.before': 'At most 3 notify times',
      'payload.notify.before.0.amount': 'Enter a whole number',
      'payload.notify.before.1.amount': 'A notice can be at most 365 days before',
      'payload.notify.before.3.amount': TIMES_DUPLICATE,
      'payload.notify.audience.userIds': PEOPLE_REQUIRED,
    });
    expect(maxNoticeAmount('hours')).toBe(365 * 24);
  });

  it('labels notices and summarizes the section', () => {
    expect(noticeLabel(0, 'minutes')).toBe('At the start');
    expect(noticeLabel(1, 'days')).toBe('1 day before');
    expect(noticeLabel(2, 'hours')).toBe('2 hours before');
    const p = newEventPayload(NOW);
    expect(notifySummary(p, false)).toBe('1 day before · Everyone who can read it');
    expect(notifySummary(p, true)).toBe('1 day before');
    const nobody = {
      ...p,
      notify: { ...p.notify, audience: { mode: 'nobody' as const, userIds: [] } },
    };
    expect(notifySummary(nobody, false)).toBe('Nobody is notified');
    expect(notifySummary({ ...p, notify: { ...p.notify, before: [] } }, false)).toBe(
      'No notifications',
    );
  });

  it('lists notify times that are already past', () => {
    const p: EventDraftPayload = {
      ...newEventPayload(NOW),
      start: '2026-11-03T16:00',
      notify: {
        before: [
          { amount: '1', unit: 'days' },
          { amount: '1', unit: 'hours' },
        ],
        audience: { mode: 'everyone', userIds: [] },
      },
    };
    expect(pastNoticeLabels(p, NOW)).toEqual(['1 day before']);
    expect(pastNoticeLabels({ ...p, start: '' }, NOW)).toEqual([]);
  });
});
