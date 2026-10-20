import { describe, expect, it } from 'vitest';
import { daysLeft, daysLeftLabel } from './days-left';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DELETED = '2026-10-01T12:00:00.000Z';
const at = (ms: number) => new Date(new Date(DELETED).getTime() + ms);

describe('daysLeft (D132)', () => {
  it('is 30 right after deletion', () => {
    expect(daysLeft(DELETED, at(0))).toBe(30);
  });

  it('is 27 three days later', () => {
    expect(daysLeft(DELETED, at(3 * DAY_MS))).toBe(27);
  });

  it('floors partial days', () => {
    expect(daysLeft(DELETED, at(3 * DAY_MS + HOUR_MS))).toBe(26);
    expect(daysLeft(DELETED, at(29 * DAY_MS + 23 * HOUR_MS))).toBe(0);
  });

  it('never goes below 0', () => {
    expect(daysLeft(DELETED, at(31 * DAY_MS))).toBe(0);
  });

  it('honours a custom window', () => {
    expect(daysLeft(DELETED, at(DAY_MS), 7)).toBe(6);
  });
});

describe('daysLeftLabel', () => {
  it('pluralises and handles the last day', () => {
    expect(daysLeftLabel(30)).toBe('30 days left');
    expect(daysLeftLabel(1)).toBe('1 day left');
    expect(daysLeftLabel(0)).toBe('Less than a day left');
  });
});
