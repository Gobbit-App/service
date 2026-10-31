import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck, Member } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { MembersSection } = await import('./MembersSection');

const STAMP = '2026-01-01T00:00:00.000Z';
const member = (name: string, overrides: Partial<Member> = {}): Member => ({
  userId: `user-${name.toLowerCase()}`,
  email: `${name.toLowerCase()}@example.test`,
  displayName: name,
  role: 'reader',
  invitedAt: STAMP,
  acceptedAt: STAMP,
  implicit: false,
  ...overrides,
});

const members = [
  member('Olive', { role: 'owner', implicit: true, invitedAt: null }),
  member('Me', { role: 'owner' }),
  member('Rita'),
  member('Pat', { role: 'editor', acceptedAt: null }),
];

function setup(deck: Partial<Deck> = {}, online = true) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /decks/{id}/members') return { data: members };
    if (request === 'PATCH /decks/{id}/members/{userId}') return member('Rita', { role: 'editor' });
    if (request === 'DELETE /decks/{id}/members/{userId}') return undefined;
    throw new Error(`unexpected ${request}`);
  });
  return renderWithClient(<MembersSection deck={makeDeck(deck)} meId="user-me" online={online} />);
}

const row = async (name: string) =>
  (await screen.findByText(name, { selector: 'strong', exact: false })).closest(
    'li',
  ) as HTMLElement;

describe('MembersSection (D184, D185)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('labels implicit owners, pending invites and accepted roles', async () => {
    setup();
    expect(within(await row('Olive')).getByText('Account owner')).toBeInTheDocument();
    expect(within(await row('Pat')).getByText('Invited · Editor')).toBeInTheDocument();
    expect(within(await row('Rita')).getByLabelText('Role of Rita')).toHaveValue('reader');
  });

  it('has no controls for implicit owners or the caller', async () => {
    setup();
    for (const name of ['Olive', 'Me (you)']) {
      const li = await row(name);
      expect(within(li).queryByRole('combobox')).toBeNull();
      expect(within(li).queryByRole('button')).toBeNull();
    }
  });

  it('changes a role through the member PATCH', async () => {
    setup();
    fireEvent.change(within(await row('Rita')).getByLabelText('Role of Rita'), {
      target: { value: 'editor' },
    });
    await waitFor(() => {
      const call = requests.mock.calls.find(([r]) => r === 'PATCH /decks/{id}/members/{userId}');
      expect(call?.[1]).toMatchObject({
        params: { path: { userId: 'user-rita' } },
        body: { role: 'editor' },
      });
    });
  });

  it('remove asks first, then DELETEs; a pending row says Cancel invite', async () => {
    setup();
    const pat = await row('Pat');
    fireEvent.click(within(pat).getByRole('button', { name: 'Cancel invite Pat' }));
    expect(requests.mock.calls.some(([r]) => r.startsWith('DELETE'))).toBe(false);
    fireEvent.click(within(pat).getByRole('button', { name: 'Cancel the invite' }));
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith('DELETE /decks/{id}/members/{userId}', {
        params: { path: { id: makeDeck().id, userId: 'user-pat' } },
      }),
    );

    const rita = await row('Rita');
    fireEvent.click(within(rita).getByRole('button', { name: 'Remove Rita' }));
    fireEvent.click(within(rita).getByRole('button', { name: 'Keep' }));
    expect(within(rita).getByRole('button', { name: 'Remove Rita' })).toBeInTheDocument();
  });

  it('shows a refused role change in the row', async () => {
    setup();
    respond.mockImplementationOnce(async () => {
      throw new ApiError(409, { type: '/problems/last-owner', title: 'Conflict' });
    });
    await row('Rita');
    fireEvent.change(screen.getByLabelText('Role of Rita'), { target: { value: 'owner' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('at least one co-owner');
  });

  it.each(['maintainer', 'editor', 'reader'] as const)(
    'a %s sees a plain list without the invite form',
    async (role) => {
      setup({ role });
      expect(within(await row('Rita')).getByText('Reader')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('form', { name: 'Invite someone' })).toBeNull();
    },
  );

  it('offline the owner sees the list read-only', async () => {
    setup({}, false);
    expect(within(await row('Rita')).getByText('Reader')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  });
});
