import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { trackContent } = vi.hoisted(() => ({ trackContent: vi.fn() }));
vi.mock('../analytics/analytics', () => ({ trackContent }));
const { respond, requests } = await import('../test/api-mock');
const { InviteLinks } = await import('./InviteLinks');

const deck = makeDeck();
const member = (name: string) => ({ id: 'u1', name, username: null, initials: 'AC', photo: null });
const link = (over: Record<string, unknown>) => ({
  id: 'l1',
  name: 'Dana',
  role: 'reader',
  state: 'waiting',
  createdBy: member('Ana Cohen'),
  acceptedBy: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  expiresAt: '2026-11-15T10:00:00.000Z',
  url: 'https://g.test/s/invite?t=tok',
  ...over,
});
const list = (links: unknown[]) => respond.mockResolvedValue({ links });
const rows = async () => screen.findAllByRole('listitem');

describe('InviteLinks (D476)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
    trackContent.mockReset();
  });

  it('shows name, role, state, expiry and who created it', async () => {
    list([link({})]);
    renderWithClient(<InviteLinks deck={deck} disabled={false} />);
    const [row] = await rows();
    expect(row).toHaveTextContent('Dana');
    expect(row).toHaveTextContent('Reader');
    expect(row).toHaveTextContent(/waiting/i);
    expect(row).toHaveTextContent(/2026|Nov/);
    expect(row).toHaveTextContent('created by Ana Cohen');
  });

  it('reads "no longer valid" for an invalid row, with Revoke and no Share', async () => {
    list([link({ state: 'invalid', url: null })]);
    renderWithClient(<InviteLinks deck={deck} disabled={false} />);
    const [row] = await rows();
    expect(row).toHaveTextContent(/no longer valid/i);
    expect(within(row).queryByRole('button', { name: /share/i })).toBeNull();
    expect(within(row).getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('gives only waiting rows a Share button', async () => {
    list([
      link({ id: 'a' }),
      link({ id: 'b', name: 'Eli', state: 'accepted', url: null, acceptedBy: member('Eli Levi') }),
      link({ id: 'c', name: 'Zed', state: 'revoked', url: null }),
    ]);
    renderWithClient(<InviteLinks deck={deck} disabled={false} />);
    const all = await rows();
    expect(all).toHaveLength(3);
    expect(within(all[0]!).getByRole('button', { name: /share/i })).toBeInTheDocument();
    expect(within(all[1]!).queryByRole('button', { name: /share/i })).toBeNull();
    expect(within(all[2]!).queryByRole('button', { name: /share/i })).toBeNull();
    expect(all[1]).toHaveTextContent('Eli Levi');
  });

  it('shares the prefilled text and url, then tracks invite-shared with ids only', async () => {
    list([link({})]);
    const share = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<InviteLinks deck={deck} disabled={false} nav={{ share }} />);
    const [row] = await rows();
    await userEvent.click(within(row!).getByRole('button', { name: /share/i }));
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0]![0] as { url: string; text: string };
    expect(arg.url).toBe('https://g.test/s/invite?t=tok');
    expect(arg.text).toContain(deck.name);
    expect(trackContent).toHaveBeenCalledWith('invite-shared', {
      deckId: deck.id,
      channel: 'share-sheet',
    });
    expect(JSON.stringify(trackContent.mock.calls)).not.toContain('tok');
  });

  it('tracks copy-link when only the clipboard exists', async () => {
    list([link({})]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderWithClient(
      <InviteLinks deck={deck} disabled={false} nav={{ clipboard: { writeText } }} />,
    );
    const [row] = await rows();
    await userEvent.click(within(row!).getByRole('button', { name: /share/i }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(trackContent).toHaveBeenCalledWith('invite-shared', {
      deckId: deck.id,
      channel: 'copy-link',
    });
  });

  it('offers Revoke only on waiting and "no longer valid" rows', async () => {
    list([
      link({ id: 'a' }),
      link({ id: 'b', state: 'invalid', url: null }),
      link({ id: 'c', state: 'accepted', url: null, acceptedBy: member('Eli Levi') }),
      link({ id: 'd', state: 'revoked', url: null }),
      link({ id: 'e', state: 'expired', url: null }),
    ]);
    renderWithClient(<InviteLinks deck={deck} disabled={false} />);
    const all = await rows();
    const has = all.map((r) => within(r).queryByRole('button', { name: /revoke/i }) !== null);
    expect(has).toEqual([true, true, false, false, false]);
  });

  it('asks first, then DELETEs and refreshes the list; Keep cancels', async () => {
    list([link({})]);
    renderWithClient(<InviteLinks deck={deck} disabled={false} />);
    const [row] = await rows();
    const deleted = () =>
      requests.mock.calls.filter(([r]) => r === 'DELETE /decks/{id}/invite-links/{linkId}').length;
    const fetched = () =>
      requests.mock.calls.filter(([r]) => r === 'GET /decks/{id}/invite-links').length;

    await userEvent.click(within(row!).getByRole('button', { name: /^revoke/i }));
    expect(deleted()).toBe(0);
    await userEvent.click(within(row!).getByRole('button', { name: 'Keep' }));
    expect(deleted()).toBe(0);

    const before = fetched();
    await userEvent.click(within(row!).getByRole('button', { name: /^revoke/i }));
    await userEvent.click(within(row!).getByRole('button', { name: 'Revoke the link' }));
    await vi.waitFor(() => expect(deleted()).toBe(1));
    await vi.waitFor(() => expect(fetched()).toBeGreaterThan(before));
  });
});
