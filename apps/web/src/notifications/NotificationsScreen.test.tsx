import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingItem, PendingList } from '@gobbit/shared/reminders';
import { queryKeys } from '../api/query-keys';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { NotificationsScreen } = await import('./NotificationsScreen');

const ID_1 = '00000000-0000-4000-8000-000000000001';
const ID_2 = '00000000-0000-4000-8000-000000000002';

const entry = (o: Partial<PendingItem>): PendingItem => ({
  kind: 'reminder',
  itemId: ID_1,
  title: 'Bins',
  deck: { slug: 'home', name: 'Home' },
  deadline: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  revealAt: new Date(Date.now() - 3_600_000).toISOString(),
  overdue: false,
  ...o,
});

const LIST: PendingList = {
  items: [entry({ title: 'Pay the plumber', overdue: true, deadline: new Date(0).toISOString() })],
  upcoming: [
    entry({
      itemId: ID_2,
      title: 'Passport renewal',
      revealAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      deadline: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    }),
  ],
};

const section = (name: string) => screen.getByRole('region', { name });

describe('NotificationsScreen (037, D298)', () => {
  beforeEach(() => {
    respond.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists what waits on you, then Upcoming, each linking to its card', async () => {
    respond.mockResolvedValue(LIST);
    const { navigate } = renderWithClient(<NotificationsScreen />);
    const waiting = await screen.findByRole('region', { name: 'Waiting on you' });
    expect(within(waiting).getByText('Pay the plumber')).toBeInTheDocument();
    expect(within(waiting).getByText(/^Home · Overdue by/)).toBeInTheDocument();
    const upcoming = section('Upcoming');
    expect(within(upcoming).getByText(/^Home · Shows .* · Due /)).toBeInTheDocument();
    fireEvent.click(within(upcoming).getByRole('link'));
    expect(navigate).toHaveBeenCalledWith(`/i/${ID_2}`);
    expect(screen.queryByText('Showing the last known list')).not.toBeInTheDocument();
  });

  it('says nothing is waiting, and hides an empty Upcoming', async () => {
    respond.mockResolvedValue({ items: [], upcoming: [] });
    renderWithClient(<NotificationsScreen />);
    expect(await screen.findByText('Nothing waiting on you')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Upcoming' })).not.toBeInTheDocument();
  });

  it('keeps Upcoming under the empty state', async () => {
    respond.mockResolvedValue({ items: [], upcoming: LIST.upcoming });
    renderWithClient(<NotificationsScreen />);
    expect(await screen.findByText('Nothing waiting on you')).toBeInTheDocument();
    expect(section('Upcoming')).toBeInTheDocument();
  });

  it('shows the last known list offline, with a note', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    respond.mockRejectedValue(new TypeError('Failed to fetch'));
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.pending, LIST);
    renderWithClient(<NotificationsScreen />, { queryClient });
    expect(await screen.findByText('Showing the last known list')).toBeInTheDocument();
    expect(screen.getByText('Pay the plumber')).toBeInTheDocument();
  });

  it('explains a first load that fails offline and retries', async () => {
    respond.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithClient(<NotificationsScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're offline. Notifications need a connection the first time.",
    );
    respond.mockResolvedValue(LIST);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Pay the plumber')).toBeInTheDocument();
  });

  it('says it could not load on a server error', async () => {
    respond.mockRejectedValue(new Error('boom'));
    renderWithClient(<NotificationsScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your notifications.");
  });
});
