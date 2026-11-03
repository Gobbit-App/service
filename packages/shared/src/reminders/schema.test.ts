import { describe, expect, it } from 'vitest';
import { dismissReminderSchema, reminderPayloadSchema } from './schema';
import { payloadSchemaFor } from '../schemas/payloads';
import { itemCreateSchema } from '../schemas/item';

const UID = '11111111-1111-4111-8111-111111111111';

const valid = {
  deadline: '2030-01-01T09:00:00.000Z',
  showBefore: { amount: 24, unit: 'hours' },
  dismiss: { mode: 'me', userIds: [] },
  timeZone: 'Asia/Jerusalem',
};

describe('reminderPayloadSchema', () => {
  it('accepts a valid payload and defaults userIds', () => {
    const r = reminderPayloadSchema.parse({ ...valid, dismiss: { mode: 'writers' } });
    expect(r.dismiss.userIds).toEqual([]);
  });

  it('accepts a zero show-before', () => {
    expect(
      reminderPayloadSchema.safeParse({ ...valid, showBefore: { amount: 0, unit: 'minutes' } })
        .success,
    ).toBe(true);
  });

  it.each([
    [{ amount: 366, unit: 'days' }],
    [{ amount: 365 * 24 + 1, unit: 'hours' }],
    [{ amount: -1, unit: 'hours' }],
    [{ amount: 1.5, unit: 'hours' }],
    [{ amount: 1, unit: 'weeks' }],
  ])('rejects show-before %j', (showBefore) => {
    expect(reminderPayloadSchema.safeParse({ ...valid, showBefore }).success).toBe(false);
  });

  it('allows exactly 365 days', () => {
    expect(
      reminderPayloadSchema.safeParse({ ...valid, showBefore: { amount: 365, unit: 'days' } })
        .success,
    ).toBe(true);
  });

  it('requires people for mode "people" and forbids them otherwise', () => {
    expect(
      reminderPayloadSchema.safeParse({ ...valid, dismiss: { mode: 'people', userIds: [] } })
        .success,
    ).toBe(false);
    expect(
      reminderPayloadSchema.safeParse({ ...valid, dismiss: { mode: 'me', userIds: [UID] } })
        .success,
    ).toBe(false);
    expect(
      reminderPayloadSchema.safeParse({ ...valid, dismiss: { mode: 'people', userIds: [UID] } })
        .success,
    ).toBe(true);
  });

  it('rejects duplicate people, bad dates, unknown zones and extra keys', () => {
    expect(
      reminderPayloadSchema.safeParse({
        ...valid,
        dismiss: { mode: 'people', userIds: [UID, UID] },
      }).success,
    ).toBe(false);
    expect(reminderPayloadSchema.safeParse({ ...valid, deadline: 'tomorrow' }).success).toBe(false);
    expect(reminderPayloadSchema.safeParse({ ...valid, timeZone: 'Mars/Base' }).success).toBe(
      false,
    );
    expect(reminderPayloadSchema.safeParse({ ...valid, outcome: 'done' }).success).toBe(false);
  });

  it('is the payload schema for the reminder type and part of item create', () => {
    expect(payloadSchemaFor('reminder').safeParse(valid).success).toBe(true);
    expect(
      itemCreateSchema.safeParse({ type: 'reminder', title: 'Pay the bill', payload: valid })
        .success,
    ).toBe(true);
  });
});

describe('dismissReminderSchema', () => {
  it('trims and limits the resolution', () => {
    expect(dismissReminderSchema.parse({ done: true, resolution: '  paid  ' }).resolution).toBe(
      'paid',
    );
    expect(
      dismissReminderSchema.safeParse({ done: true, resolution: 'x'.repeat(601) }).success,
    ).toBe(false);
    expect(dismissReminderSchema.safeParse({ resolution: 'x' }).success).toBe(false);
  });
});
