import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { InviteLinkForm } = await import('./InviteLinkForm');

const deck = makeDeck();
const POST = 'POST /decks/{id}/invite-links';

describe('InviteLinkForm (D476)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('offers every role but Owner, reader selected', () => {
    renderWithClient(<InviteLinkForm deck={deck} disabled={false} />);
    const options = screen.getAllByRole<HTMLOptionElement>('option');
    expect(options.map((o) => o.value)).toEqual(['reader', 'editor', 'maintainer']);
    expect(screen.getByLabelText<HTMLSelectElement>('Role').value).toBe('reader');
  });

  it('sends the trimmed name and role', async () => {
    respond.mockResolvedValue({ id: 'l1' });
    renderWithClient(<InviteLinkForm deck={deck} disabled={false} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Dana ' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await vi.waitFor(() => expect(requests.mock.calls.some(([r]) => r === POST)).toBe(true));
    const [, init] = requests.mock.calls.find(([r]) => r === POST)!;
    expect((init as { body: unknown }).body).toEqual({ name: 'Dana', role: 'editor' });
  });

  it('shows the cap message from the server', async () => {
    respond.mockRejectedValue(
      new ApiError(409, {
        type: '/problems/invite-link-limit',
        title: 'Too many open links',
        detail: 'Revoke a link or wait for one to expire.',
      }),
    );
    renderWithClient(<InviteLinkForm deck={deck} disabled={false} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dana' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/revoke a link|too many/i);
  });

  it('is disabled offline and with an empty name', () => {
    const { unmount } = renderWithClient(<InviteLinkForm deck={deck} disabled={false} />);
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
    unmount();
    renderWithClient(<InviteLinkForm deck={deck} disabled />);
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });
});
