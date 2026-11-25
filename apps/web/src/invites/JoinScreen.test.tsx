import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { JoinScreen } = await import('./JoinScreen');

const waiting = { state: 'waiting', deckName: 'Family', inviterName: 'Ana Cohen', role: 'editor' };
const me = {
  user: { id: 'u1', email: 'a@b.c', displayName: 'Dana Levi' },
  profile: {
    username: null,
    firstName: null,
    lastName: null,
    location: null,
    avatar: null,
    initials: 'DL',
  },
  decks: [],
  isPlatformAdmin: false,
};

function answer(preview: unknown, signedIn: boolean, extra: Record<string, unknown> = {}) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /invites/preview') return preview;
    if (request === 'GET /me') {
      if (signedIn) return me;
      throw new ApiError(401, null);
    }
    if (request in extra) {
      const v = extra[request];
      if (v instanceof Error) throw v;
      return v;
    }
    return {};
  });
}

describe('JoinScreen (D470, D471)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('signed in: shows deck, inviter, role and who is signed in; Join accepts and opens the deck', async () => {
    answer(waiting, true, {
      'POST /invite-links/accept': { deck: { id: 'd1', slug: 'family', name: 'Family' } },
    });
    const { navigate } = renderWithClient(<JoinScreen token="tok" />);

    expect(await screen.findByRole('heading', { name: /Family/ })).toBeInTheDocument();
    expect(screen.getByText(/Ana Cohen/)).toBeInTheDocument();
    expect(screen.getByText(/editor/i)).toBeInTheDocument();
    expect(await screen.findByText(/Signed in as/)).toHaveTextContent('Dana Levi');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Join' }));

    expect(requests).toHaveBeenCalledWith(
      'POST /invite-links/accept',
      expect.objectContaining({ body: { token: 'tok' } }),
    );
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family'));
  });

  it('signed out: Join reveals the sign-in form, which posts the invite token', async () => {
    answer(waiting, false);
    renderWithClient(<JoinScreen token="tok" />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: /Family/ });
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Join' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    expect(requests).toHaveBeenCalledWith(
      'POST /auth/magic-link',
      expect.objectContaining({ body: { email: 'new@example.com', invite: 'tok' } }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('new@example.com');
  });

  it.each([
    ['used', /already (been )?used/i],
    ['revoked', /(revoked|cancelled|canceled)/i],
    ['expired', /expired/i],
    ['invalid', /no longer valid/i],
  ])('%s: says why and offers no Join', async (state, copy) => {
    answer({ state }, true);
    renderWithClient(<JoinScreen token="tok" />);

    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });

  it('already a member (409): "You\'re already in" with a link to the deck', async () => {
    answer(waiting, true, {
      'POST /invite-links/accept': new ApiError(409, {
        type: '/problems/invite-link-already-member',
        status: 409,
        deck: { slug: 'family' },
      }),
    });
    renderWithClient(<JoinScreen token="tok" />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Join' }));

    expect(await screen.findByText("You're already in")).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/d/family');
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });
});
