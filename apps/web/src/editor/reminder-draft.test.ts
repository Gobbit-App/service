import { describe, expect, it } from 'vitest';
import {
  checkReminder,
  DEADLINE_IN_PAST,
  DEADLINE_REQUIRED,
  isoToLocalInput,
  localInputToIso,
  maxShowBefore,
  newReminderPayload,
  PEOPLE_REQUIRED,
  reminderDraftFromPayload,
  reminderToPayload,
  type ReminderDraftPayload,
} from './reminder-draft';
import type { FieldErrors } from './validate';

const NOW = new Date(2026, 10, 3, 14, 30);

const check = (p: ReminderDraftPayload, now = NOW): FieldErrors => {
  const errors: FieldErrors = {};
  checkReminder(p, errors, now);
  return errors;
};

describe('reminder draft (037)', () => {
  it('a new reminder is due tomorrow at 09:00, shown 24 hours before, writers dismiss', () => {
    const p = newReminderPayload(NOW);
    expect(p.deadline).toBe('2026-11-04T09:00');
    expect(p.storedDeadline).toBeNull();
    expect(p.showBefore).toEqual({ amount: '24', unit: 'hours' });
    expect(p.dismiss).toEqual({ mode: 'writers', userIds: [] });
    expect(check(p)).toEqual({});
  });

  it('round-trips local input and ISO in the device zone', () => {
    const iso = localInputToIso('2026-11-04T09:00')!;
    expect(isoToLocalInput(iso)).toBe('2026-11-04T09:00');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('tomorrow')).toBeNull();
    expect(isoToLocalInput('nope')).toBe('');
  });

  it('reads a stored payload and falls back on unreadable parts', () => {
    const stored = '2026-12-01T08:00:00.000Z';
    const p = reminderDraftFromPayload({
      deadline: stored,
      showBefore: { amount: 2, unit: 'days' },
      dismiss: { mode: 'people', userIds: ['u1', 7] },
      timeZone: 'Asia/Jerusalem',
    });
    expect(p.storedDeadline).toBe(stored);
    expect(p.deadline).toBe(isoToLocalInput(stored));
    expect(p.showBefore).toEqual({ amount: '2', unit: 'days' });
    expect(p.dismiss).toEqual({ mode: 'people', userIds: ['u1'] });
    expect(p.timeZone).toBe('Asia/Jerusalem');

    const junk = reminderDraftFromPayload({ showBefore: 'x', dismiss: { mode: 'all' } });
    expect(junk.storedDeadline).toBeNull();
    expect(junk.showBefore.unit).toBe('hours');
    expect(junk.dismiss.mode).toBe('writers');
  });

  it('sends an untouched deadline and its zone unchanged, a changed one as an instant', () => {
    const stored = '2026-01-01T08:00:00.000Z';
    const draft = reminderDraftFromPayload({
      deadline: stored,
      showBefore: { amount: 1, unit: 'hours' },
      dismiss: { mode: 'me', userIds: [] },
      timeZone: 'Pacific/Auckland',
    });
    expect(reminderToPayload(draft)).toMatchObject({
      deadline: stored,
      timeZone: 'Pacific/Auckland',
      showBefore: { amount: 1, unit: 'hours' },
      dismiss: { mode: 'me', userIds: [] },
    });

    const changed = reminderToPayload({ ...draft, deadline: '2026-12-24T18:15' });
    expect(changed['deadline']).toBe(localInputToIso('2026-12-24T18:15'));
    expect(changed['timeZone']).not.toBe('Pacific/Auckland');
  });

  it('sends picked people only for the people mode', () => {
    const p = {
      ...newReminderPayload(NOW),
      dismiss: { mode: 'writers' as const, userIds: ['u1'] },
    };
    expect(reminderToPayload(p)['dismiss']).toEqual({ mode: 'writers', userIds: [] });
  });

  it('requires a future deadline, but keeps an unchanged past one', () => {
    const p = newReminderPayload(NOW);
    expect(check({ ...p, deadline: '' })['payload.deadline']).toBe(DEADLINE_REQUIRED);
    expect(check({ ...p, deadline: '2026-11-03T14:00' })['payload.deadline']).toBe(
      DEADLINE_IN_PAST,
    );
    const past = '2026-01-01T08:00:00.000Z';
    expect(
      check({ ...p, storedDeadline: past, deadline: isoToLocalInput(past) })['payload.deadline'],
    ).toBeUndefined();
  });

  it('checks the show-before amount against the shared cap', () => {
    const p = newReminderPayload(NOW);
    const amount = (value: string, unit: ReminderDraftPayload['showBefore']['unit'] = 'hours') =>
      check({ ...p, showBefore: { amount: value, unit } })['payload.showBefore.amount'];
    expect(amount('')).toBe('Enter a whole number');
    expect(amount('1.5')).toBe('Enter a whole number');
    expect(amount('-1')).toBe('Enter a whole number');
    expect(amount('0')).toBeUndefined();
    expect(amount(String(maxShowBefore('days')), 'days')).toBeUndefined();
    expect(amount(String(maxShowBefore('days') + 1), 'days')).toMatch(/at most/);
    expect(maxShowBefore('hours')).toBe(maxShowBefore('days') * 24);
  });

  it('needs at least one person for the people mode', () => {
    const p = { ...newReminderPayload(NOW), dismiss: { mode: 'people' as const, userIds: [] } };
    expect(check(p)['payload.dismiss.userIds']).toBe(PEOPLE_REQUIRED);
    expect(check({ ...p, dismiss: { mode: 'people', userIds: ['u1'] } })).toEqual({});
  });
});
