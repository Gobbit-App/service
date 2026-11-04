import { describe, expect, it } from 'vitest';
import { makeReminder } from '../test/fixtures';
import { formatDuration, formatWhen, reminderStatus } from './reminder-status';

const HOUR = 3_600_000;
const nameOf = (id: string | null) => (id === 'me' ? 'you' : id === 'u2' ? 'Dana' : 'someone');
const state = (overrides: Parameters<typeof makeReminder>[0]) => makeReminder(overrides).reminder!;

describe('reminder status line (037)', () => {
  it('formats durations in the largest whole unit', () => {
    expect(formatDuration(30_000)).toBe('1 minute');
    expect(formatDuration(45 * 60_000)).toBe('45 minutes');
    expect(formatDuration(-3 * HOUR)).toBe('3 hours');
    expect(formatDuration(30 * HOUR)).toBe('30 hours');
    expect(formatDuration(50 * HOUR)).toBe('2 days');
  });

  it('formats a time as "Tue 5 Nov, 09:00"', () => {
    expect(formatWhen('2026-11-05T09:00:00.000Z', 'UTC')).toBe('Thu 5 Nov, 09:00');
  });

  it('pending: due in, overdue (warning) and shows on for hidden ones', () => {
    const deadline = '2026-11-05T09:00:00.000Z';
    const twoDaysBefore = new Date(Date.parse(deadline) - 50 * HOUR);
    expect(reminderStatus(state({ deadline }), nameOf, twoDaysBefore, 'UTC')).toEqual({
      text: 'Due in 2 days · Thu 5 Nov, 09:00',
      tone: 'normal',
    });
    const late = new Date(Date.parse(deadline) + 3 * HOUR);
    expect(reminderStatus(state({ deadline }), nameOf, late, 'UTC')).toEqual({
      text: 'Overdue by 3 hours',
      tone: 'warning',
    });
    expect(
      reminderStatus(
        state({ deadline, revealAt: '2026-11-04T09:00:00.000Z', hidden: true }),
        nameOf,
        twoDaysBefore,
        'UTC',
      ).text,
    ).toBe('Shows on Wed 4 Nov, 09:00 · Due Thu 5 Nov, 09:00');
  });

  it('done and dismissed name who closed it, with the resolution', () => {
    expect(
      reminderStatus(state({ state: 'done', dismissedBy: 'u2', resolution: 'Paid' }), nameOf),
    ).toEqual({ text: 'Done by Dana · Paid', tone: 'muted' });
    expect(reminderStatus(state({ state: 'dismissed', dismissedBy: 'me' }), nameOf).text).toBe(
      'Dismissed by you',
    );
  });
});
