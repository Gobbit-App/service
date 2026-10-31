import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminWaitlistPage } from '@gobbit/shared';
import { renderWithClient } from '../test/render';
import { makeCounts, makeWaitlistEntry } from './test-fixtures';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { WaitlistScreen } = await import('./WaitlistScreen');

type ListQuery = { status: string; kind?: string; cursor?: string };

/** The `query` of the n-th `GET /admin/waitlist` call. */
function listQuery(n: number): ListQuery {
  const calls = requests.mock.calls.filter(([r]) => r === 'GET /admin/waitlist');
  return (calls[n]?.[1] as { params: { query: ListQuery } }).params.query;
}

function page(overrides: Partial<AdminWaitlistPage> = {}): AdminWaitlistPage {
  return {
    items: [makeWaitlistEntry()],
    nextCursor: null,
    counts: makeCounts({ pending: 2, confirmed: 1, invited: 3 }),
    ...overrides,
  };
}

describe('WaitlistScreen', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on the confirmed tab with counts on every tab', async () => {
    respond.mockResolvedValue(page());
    renderWithClient(<WaitlistScreen />);
    const list = await screen.findByRole('list', { name: 'Confirmed entries' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    const tabs = screen.getByRole('group', { name: 'Status' });
    expect(within(tabs).getByRole('button', { name: 'Confirmed 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(tabs).getByRole('button', { name: 'Invited 3' })).toBeInTheDocument();
    expect(listQuery(0)).toEqual({ status: 'confirmed' });
  });

  it('switches status and filters by kind', async () => {
    respond.mockResolvedValue(page());
    renderWithClient(<WaitlistScreen />);
    await screen.findByRole('list', { name: 'Confirmed entries' });

    fireEvent.click(screen.getByRole('button', { name: 'Invited 3' }));
    await screen.findByRole('list', { name: 'Invited entries' });
    expect(listQuery(1)).toEqual({ status: 'invited' });

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'family' } });
    await vi.waitFor(() => expect(listQuery(2)).toEqual({ status: 'invited', kind: 'family' }));
  });

  it('loads the next page with the cursor', async () => {
    respond
      .mockResolvedValueOnce(page({ nextCursor: 'next-1' }))
      .mockResolvedValueOnce(
        page({ items: [makeWaitlistEntry({ id: 'second', email: 'two@example.test' })] }),
      );
    renderWithClient(<WaitlistScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('two@example.test')).toBeInTheDocument();
    expect(listQuery(1)).toEqual({ status: 'confirmed', cursor: 'next-1' });
  });

  it('says so when a tab is empty', async () => {
    respond.mockResolvedValue(page({ items: [] }));
    renderWithClient(<WaitlistScreen />);
    expect(await screen.findByText('Nobody is waiting for an invite.')).toBeInTheDocument();
  });

  it('asks for a connection when offline', async () => {
    respond.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithClient(<WaitlistScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're offline. The waitlist needs a connection.",
    );
  });

  it('keeps the resend notice after the invited row leaves the tab', async () => {
    const entry = makeWaitlistEntry();
    respond.mockImplementation(async (request) => {
      if (request === 'POST /admin/waitlist/{id}/invite') {
        return { entry: { ...entry, status: 'invited' }, mailSent: false };
      }
      return page({ items: [] });
    });
    respond.mockResolvedValueOnce(page());
    renderWithClient(<WaitlistScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite person@example.test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'person@example.test is invited, but the email couldn’t be sent',
    );
    await screen.findByText('Nobody is waiting for an invite.');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
