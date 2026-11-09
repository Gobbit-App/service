import { describe, expect, it } from 'vitest';
import { eventPayloadSchema } from './schema';
import { itemCreateSchema } from '../schemas/item';
import { payloadSchemaFor } from '../schemas/payloads';

const UID = '11111111-1111-4111-8111-111111111111';

const timed = {
  allDay: false,
  start: '2026-12-03T18:00:00+02:00',
  end: '2026-12-03T20:00:00+02:00',
  timeZone: 'Asia/Jerusalem',
};
const allDay = { allDay: true, start: '2026-12-03', end: '2026-12-05', timeZone: 'Asia/Jerusalem' };

const issuesOf = (input: unknown) => {
  const r = eventPayloadSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('eventPayloadSchema', () => {
  it('accepts a timed event and defaults notify', () => {
    const r = eventPayloadSchema.parse(timed);
    expect(r.notify).toEqual({
      before: [{ amount: 1, unit: 'days' }],
      audience: { mode: 'everyone', userIds: [] },
    });
  });

  it('accepts an all-day event with location, url and preview', () => {
    expect(
      eventPayloadSchema.safeParse({
        ...allDay,
        location: '  Town hall  ',
        url: 'https://example.com/e',
        preview: { title: 'Fair' },
      }).success,
    ).toBe(true);
  });

  it('trims the location', () => {
    expect(eventPayloadSchema.parse({ ...timed, location: '  Hall ' }).location).toBe('Hall');
  });

  it.each([
    [{ ...timed, start: '2026-12-03' }, 'start'],
    [{ ...timed, start: '2026-12-03T18:00:00' }, 'start'],
    [{ ...allDay, start: '2026-12-03T18:00:00Z' }, 'start'],
    [{ ...allDay, start: '2026-02-30' }, 'start'],
    [{ ...timed, end: '2026-12-03T18:00:00+02:00' }, 'end'],
    [{ ...timed, end: '2026-12-03T17:00:00+02:00' }, 'end'],
    [{ ...allDay, end: '2026-12-02' }, 'end'],
    [{ ...timed, timeZone: 'Mars/Olympus' }, 'timeZone'],
    [{ ...timed, location: '' }, 'location'],
    [{ ...timed, location: 'x'.repeat(201) }, 'location'],
    [{ ...timed, url: 'ftp://example.com' }, 'url'],
    [{ ...timed, extra: 1 }, ''],
  ])('refuses %j at %s', (input, path) => {
    expect(issuesOf(input)).toContain(path);
  });

  it('accepts a same-day all-day end', () => {
    expect(eventPayloadSchema.safeParse({ ...allDay, end: '2026-12-03' }).success).toBe(true);
  });

  describe('notify', () => {
    const withNotify = (
      base: object,
      before: unknown,
      audience: unknown = { mode: 'everyone' },
    ) => ({
      ...base,
      notify: { before, audience },
    });

    it('accepts none, at-the-start and up to three times', () => {
      expect(eventPayloadSchema.safeParse(withNotify(timed, [])).success).toBe(true);
      expect(
        eventPayloadSchema.safeParse(
          withNotify(timed, [
            { amount: 0, unit: 'minutes' },
            { amount: 2, unit: 'hours' },
            { amount: 365, unit: 'days' },
          ]),
        ).success,
      ).toBe(true);
    });

    it.each([
      [
        [
          { amount: 1, unit: 'days' },
          { amount: 2, unit: 'days' },
          { amount: 3, unit: 'days' },
          { amount: 4, unit: 'days' },
        ],
        'notify.before',
      ],
      [
        [
          { amount: 1, unit: 'days' },
          { amount: 1, unit: 'days' },
        ],
        'notify.before',
      ],
      [[{ amount: 366, unit: 'days' }], 'notify.before.0.amount'],
      [[{ amount: 365 * 24 + 1, unit: 'hours' }], 'notify.before.0.amount'],
      [[{ amount: -1, unit: 'days' }], 'notify.before.0.amount'],
    ])('refuses before %j', (before, path) => {
      expect(issuesOf(withNotify(timed, before))).toContain(path);
    });

    it('allows only days on all-day events', () => {
      expect(issuesOf(withNotify(allDay, [{ amount: 2, unit: 'hours' }]))).toContain(
        'notify.before.0.unit',
      );
    });

    it('checks the audience like the dismiss rule', () => {
      expect(issuesOf(withNotify(timed, [], { mode: 'people', userIds: [] }))).toContain(
        'notify.audience.userIds',
      );
      expect(issuesOf(withNotify(timed, [], { mode: 'me', userIds: [UID] }))).toContain(
        'notify.audience.userIds',
      );
      expect(
        eventPayloadSchema.safeParse(withNotify(timed, [], { mode: 'people', userIds: [UID] }))
          .success,
      ).toBe(true);
      expect(eventPayloadSchema.safeParse(withNotify(timed, [], { mode: 'nobody' })).success).toBe(
        true,
      );
    });
  });

  it('is registered for the event type', () => {
    expect(payloadSchemaFor('event').safeParse(timed).success).toBe(true);
    expect(
      itemCreateSchema.safeParse({ type: 'event', title: 'Fair', payload: allDay }).success,
    ).toBe(true);
  });
});
