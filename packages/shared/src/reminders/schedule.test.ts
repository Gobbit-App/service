import { describe, expect, it } from 'vitest';
import { isOverdue, revealAt, showBeforeMs } from './schedule';

describe('schedule', () => {
  it('computes the reveal instant per unit', () => {
    const d = '2030-03-10T12:00:00.000Z';
    expect(revealAt(d, { amount: 30, unit: 'minutes' }).toISOString()).toBe(
      '2030-03-10T11:30:00.000Z',
    );
    expect(revealAt(d, { amount: 24, unit: 'hours' }).toISOString()).toBe(
      '2030-03-09T12:00:00.000Z',
    );
    expect(revealAt(d, { amount: 2, unit: 'days' }).toISOString()).toBe('2030-03-08T12:00:00.000Z');
  });

  it('shows at the deadline with a zero period', () => {
    expect(revealAt(new Date('2030-01-01T00:00:00Z'), { amount: 0, unit: 'days' }).getTime()).toBe(
      new Date('2030-01-01T00:00:00Z').getTime(),
    );
    expect(showBeforeMs({ amount: 0, unit: 'hours' })).toBe(0);
  });

  it('uses instant arithmetic across a DST change (days are 24 h)', () => {
    // Europe DST starts 2030-03-31; one "day" before is exactly 24 h earlier.
    expect(revealAt('2030-03-31T12:00:00Z', { amount: 1, unit: 'days' }).toISOString()).toBe(
      '2030-03-30T12:00:00.000Z',
    );
  });

  it('is overdue at and after the deadline', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(isOverdue('2030-01-01T00:00:00Z', now)).toBe(true);
    expect(isOverdue('2029-12-31T23:59:59Z', now)).toBe(true);
    expect(isOverdue('2030-01-01T00:00:01Z', now)).toBe(false);
  });
});
