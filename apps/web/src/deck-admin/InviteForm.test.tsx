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
    fireEvent.change(screen.getByLabelText('Email or username'), {
      target: { value: ' ana@example.test ' },
    });
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
    fireEvent.change(screen.getByLabelText('Email or username'), { target: { value: 'nope@x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email address');
    await waitFor(() =>
      expect(screen.getByLabelText('Email or username')).toHaveAttribute('aria-invalid'),
    );
  });

  describe('lookup preview (D424)', () => {
    const hit = {
      member: { id: 'u1', name: 'Ana Cohen', username: 'ana', initials: 'AC', photo: null },
    };
    const lookupBodies = () =>
      requests.mock.calls
        .filter(([r]) => r === 'POST /members/lookup')
        .map(([, init]) => (init as { body: unknown }).body);
    const type = (value: string) =>
      fireEvent.change(screen.getByLabelText('Email or username'), { target: { value } });

    it('sends a username when there is no @, previewing the hit', async () => {
      respond.mockImplementation(async (r) => (r === 'POST /members/lookup' ? hit : {}));
      renderWithClient(<InviteForm deck={deck} disabled={false} />);
      type(' ana ');
      expect(await screen.findByText('Ana Cohen')).toBeInTheDocument();
      expect(lookupBodies()).toEqual([{ query: 'ana' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
      await waitFor(() =>
        expect(requests.mock.calls.some(([r]) => r === 'POST /decks/{id}/invites')).toBe(true),
      );
      const [, init] = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/invites')!;
      expect((init as { body: unknown }).body).toEqual({ username: 'ana', role: 'reader' });
    });

    it('looks up a complete email and previews a deck mate', async () => {
      respond.mockResolvedValue(hit);
      renderWithClient(<InviteForm deck={deck} disabled={false} />);
      type('ana@example.test');
      expect(await screen.findByText('Ana Cohen')).toBeInTheDocument();
      expect(lookupBodies()).toEqual([{ query: 'ana@example.test' }]);
    });

    it('says the same thing for every username miss and nothing for an email miss', async () => {
      respond.mockResolvedValue({ member: null });
      renderWithClient(<InviteForm deck={deck} disabled={false} />);
      type('ghost');
      expect(await screen.findByText('No member found')).toBeInTheDocument();
      type('other');
      expect(await screen.findByText('No member found')).toBeInTheDocument();
      type('x@example.test');
      await waitFor(() => expect(lookupBodies()).toContainEqual({ query: 'x@example.test' }));
      expect(screen.queryByText('No member found')).toBeNull();
    });

    it('swallows a lookup 429 and still sends', async () => {
      respond.mockImplementation(async (r) => {
        if (r === 'POST /members/lookup') throw new ApiError(429, {});
        return {};
      });
      renderWithClient(<InviteForm deck={deck} disabled={false} />);
      type('ana');
      await waitFor(() => expect(lookupBodies()).toHaveLength(1));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('No member found')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
      expect(await screen.findByText(/Invite sent to ana/)).toBeInTheDocument();
    });

    it('waits ~400 ms and skips empty or incomplete input', () => {
      vi.useFakeTimers();
      try {
        respond.mockResolvedValue({ member: null });
        renderWithClient(<InviteForm deck={deck} disabled={false} />);
        type('an');
        type('ana');
        vi.advanceTimersByTime(399);
        expect(lookupBodies()).toHaveLength(0);
        vi.advanceTimersByTime(1);
        expect(lookupBodies()).toEqual([{ query: 'ana' }]);
        type('a@b');
        type('');
        vi.advanceTimersByTime(1000);
        expect(lookupBodies()).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('is disabled offline', () => {
    renderWithClient(<InviteForm deck={deck} disabled />);
    expect(screen.getByLabelText('Email or username')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  });
});
