import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingList } from '@gobbit/shared/reminders';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { NotificationsBell } = await import('./NotificationsBell');

const entry = (overdue: boolean) => ({
  kind: 'reminder' as const,
  itemId: crypto.randomUUID(),
  title: 'Bins',
  deck: { slug: 'home', name: 'Home' },
  deadline: '2026-11-05T09:00:00.000Z',
  revealAt: '2026-11-04T09:00:00.000Z',
  overdue,
});

const answer = (list: PendingList) => respond.mockResolvedValue(list);
const light = () => document.querySelector('[data-light]')?.getAttribute('data-light') ?? null;

describe('NotificationsBell (037, D298)', () => {
  beforeEach(() => {
    respond.mockReset();
  });

  it('opens /notifications', async () => {
    answer({ items: [], upcoming: [] });
    const { navigate } = renderWithClient(<NotificationsBell />);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith('GET /me/pending'));
    fireEvent.click(screen.getByRole('link', { name: 'Notifications' }));
    expect(navigate).toHaveBeenCalledWith('/notifications');
    expect(light()).toBeNull();
  });

  it('shows the pending light with the count in its name', async () => {
    answer({ items: [entry(false)], upcoming: [] });
    renderWithClient(<NotificationsBell />);
    await screen.findByRole('link', { name: 'Notifications, 1 pending' });
    expect(light()).toBe('pending');
  });

  it('shows the overdue light once one is late', async () => {
    answer({ items: [entry(true), entry(false)], upcoming: [] });
    renderWithClient(<NotificationsBell />);
    await screen.findByRole('link', { name: 'Notifications, 2 pending, 1 overdue' });
    expect(light()).toBe('overdue');
  });

  it('stays a plain bell when the list fails to load', async () => {
    respond.mockRejectedValue(new TypeError('offline'));
    renderWithClient(<NotificationsBell />);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    expect(light()).toBeNull();
  });
});
