import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminWaitlistEntry } from '@pb/shared';
import { ApiError } from '../api/api-error';
import { renderWithClient } from '../test/render';
import { makeWaitlistEntry } from './test-fixtures';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { WaitlistRow } = await import('./WaitlistRow');

const NOW = new Date('2026-03-10T12:00:00.000Z');

function setup(entry: AdminWaitlistEntry, { online = true } = {}) {
  const onMailFailed = vi.fn();
  renderWithClient(
    <ul>
      <WaitlistRow entry={entry} now={NOW} online={online} onMailFailed={onMailFailed} />
    </ul>,
  );
  return { onMailFailed };
}

describe('WaitlistRow', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('shows the email, kind, when and the note in its own direction', () => {
    setup(makeWaitlistEntry({ note: 'שלום, our family', kind: 'family' }));
    expect(screen.getByText('person@example.test')).toBeInTheDocument();
    expect(screen.getByText(/^Family · Confirmed/)).toBeInTheDocument();
    expect(screen.getByText('שלום, our family')).toHaveAttribute('dir', 'auto');
  });

  it('invites a confirmed entry', async () => {
    const entry = makeWaitlistEntry();
    respond.mockResolvedValue({ entry: { ...entry, status: 'invited' }, mailSent: true });
    const { onMailFailed } = setup(entry);
    fireEvent.click(screen.getByRole('button', { name: 'Invite person@example.test' }));
    await vi.waitFor(() =>
      expect(respond).toHaveBeenCalledWith('POST /admin/waitlist/{id}/invite'),
    );
    const call = requests.mock.calls.find(([r]) => r === 'POST /admin/waitlist/{id}/invite');
    expect(call?.[1]).toEqual({ params: { path: { id: entry.id } } });
    expect(onMailFailed).not.toHaveBeenCalled();
  });

  it('reports an invite whose email failed so the screen can ask for a resend', async () => {
    const entry = makeWaitlistEntry();
    const invited = { ...entry, status: 'invited' as const };
    respond.mockResolvedValue({ entry: invited, mailSent: false });
    const { onMailFailed } = setup(entry);
    fireEvent.click(screen.getByRole('button', { name: 'Invite person@example.test' }));
    await vi.waitFor(() => expect(onMailFailed).toHaveBeenCalledWith(invited));
  });

  it('offers Resend, not Remove, on invited entries', () => {
    setup(makeWaitlistEntry({ status: 'invited', invitedAt: '2026-03-09T12:00:00.000Z' }));
    expect(
      screen.getByRole('button', { name: 'Resend the link to person@example.test' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('offers only Remove on pending entries and nothing on removed ones', () => {
    const { unmount } = renderWithClient(
      <ul>
        <WaitlistRow
          entry={makeWaitlistEntry({ status: 'pending', confirmedAt: null })}
          now={NOW}
          online
          onMailFailed={vi.fn()}
        />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: /Invite/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove person@example.test' })).toBeInTheDocument();
    unmount();

    setup(makeWaitlistEntry({ status: 'removed', removedAt: '2026-03-09T12:00:00.000Z' }));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('removes only after confirming', async () => {
    const entry = makeWaitlistEntry();
    respond.mockResolvedValue(undefined);
    setup(entry);
    fireEvent.click(screen.getByRole('button', { name: 'Remove person@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(respond).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove person@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove person@example.test' }));
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith('DELETE /admin/waitlist/{id}'));
  });

  it('explains a refused invite in plain words', async () => {
    respond.mockRejectedValue(
      new ApiError(409, { title: 'Conflict', type: '/problems/waitlist-removed' }),
    );
    setup(makeWaitlistEntry());
    fireEvent.click(screen.getByRole('button', { name: 'Invite person@example.test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This entry was removed.');
  });

  it('blocks actions while offline', () => {
    setup(makeWaitlistEntry(), { online: false });
    fireEvent.click(screen.getByRole('button', { name: 'Invite person@example.test' }));
    expect(respond).not.toHaveBeenCalled();
  });
});
