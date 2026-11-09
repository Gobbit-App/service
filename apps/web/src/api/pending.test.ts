import { describe, expect, it } from 'vitest';
import type { PendingItem } from '@gobbit/shared/reminders';
import { bellState } from './pending';

const entry = (overdue: boolean): PendingItem => ({
  kind: 'reminder',
  itemId: '00000000-0000-4000-8000-000000000001',
  title: 'Bins',
  deck: { slug: 'home', name: 'Home' },
  deadline: '2026-11-05T09:00:00.000Z',
  revealAt: '2026-11-04T09:00:00.000Z',
  overdue,
});

describe('bellState (037, D298)', () => {
  it('is plain "Notifications" with no light while nothing waits (or before loading)', () => {
    expect(bellState(undefined)).toEqual({ light: 'none', label: 'Notifications' });
    expect(bellState({ items: [], upcoming: [entry(false)], comingUp: [] })).toEqual({
      light: 'none',
      label: 'Notifications',
    });
  });

  it('lights up and counts what is pending', () => {
    expect(bellState({ items: [entry(false), entry(false)], upcoming: [], comingUp: [] })).toEqual({
      light: 'pending',
      label: 'Notifications, 2 pending',
    });
  });

  it('turns to overdue once one is late and counts it', () => {
    expect(bellState({ items: [entry(true), entry(false)], upcoming: [], comingUp: [] })).toEqual({
      light: 'overdue',
      label: 'Notifications, 2 pending, 1 overdue',
    });
  });
});
