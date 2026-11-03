import { describe, expect, it } from 'vitest';
import type { PendingItem } from '@gobbit/shared/reminders';
import { pendingEntryMeta } from './pending-entry';

const NOW = new Date('2026-11-05T06:00:00.000Z');

const entry = (o: Partial<PendingItem> = {}): PendingItem => ({
  kind: 'reminder',
  itemId: '00000000-0000-4000-8000-000000000001',
  title: 'Bins',
  deck: { slug: 'home', name: 'Home' },
  deadline: '2026-11-05T09:00:00.000Z',
  revealAt: '2026-11-04T09:00:00.000Z',
  overdue: false,
  ...o,
});

describe('pendingEntryMeta (037, D298)', () => {
  it('says how long is left and when it is due', () => {
    expect(pendingEntryMeta(entry(), 'waiting', NOW, 'UTC')).toEqual({
      text: 'Home · Due in 3 hours · Thu 5 Nov, 09:00',
      overdue: false,
    });
  });

  it('says how late an overdue one is', () => {
    const late = entry({ deadline: '2026-11-05T04:00:00.000Z', overdue: true });
    expect(pendingEntryMeta(late, 'waiting', NOW, 'UTC')).toEqual({
      text: 'Home · Overdue by 2 hours',
      overdue: true,
    });
  });

  it('treats a deadline that passed since loading as overdue', () => {
    const passed = entry({ deadline: '2026-11-05T05:30:00.000Z' });
    expect(pendingEntryMeta(passed, 'waiting', NOW, 'UTC').overdue).toBe(true);
  });

  it('gives Upcoming entries when they show and when they are due', () => {
    const hidden = entry({
      revealAt: '2026-11-07T09:00:00.000Z',
      deadline: '2026-11-08T09:00:00.000Z',
    });
    expect(pendingEntryMeta(hidden, 'upcoming', NOW, 'UTC')).toEqual({
      text: 'Home · Shows Sat 7 Nov, 09:00 · Due Sun 8 Nov, 09:00',
      overdue: false,
    });
  });
});
