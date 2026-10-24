import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { InviteForm } = await import('./InviteForm');

const deck = makeDeck();

describe('InviteForm (D184)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('offers every role with its label, reader first and selected', () => {
    renderWithClient(<InviteForm deck={deck} disabled={false} />);
    const options = screen.getAllByRole<HTMLOptionElement>('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Reader — Read only',
      'Editor — Add and edit cards',
      'Maintainer — Edit, publish, manage categories',
      'Co-owner — Everything except deleting the deck',
    ]);
    expect(screen.getByLabelText<HTMLSelectElement>('Role').value).toBe('reader');
  });

  it('sends email and role, then confirms', async () => {
    respond.mockResolvedValue({ membership: {} });
    renderWithClient(<InviteForm deck={deck} disabled={false} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' ana@example.test ' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Invite sent to ana@example.test');
    const [, init] = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/invites')!;
    expect((init as { body: unknown }).body).toEqual({ email: 'ana@example.test', role: 'owner' });
  });

  it('shows server errors under the field', async () => {
    respond.mockRejectedValue(
      new ApiError(400, { errors: [{ path: 'email', message: 'Invalid email address' }] }),
    );
    renderWithClient(<InviteForm deck={deck} disabled={false} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope@x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email address');
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid'));
  });

  it('is disabled offline', () => {
    renderWithClient(<InviteForm deck={deck} disabled />);
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  });
});
