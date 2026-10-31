import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, IngestToken } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { queryKeys } from '../api/query-keys';
import { makeDeck } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { SettingsScreen } = await import('./SettingsScreen');

const STAMP = '2026-01-01T00:00:00.000Z';
const family = makeDeck({ id: '00000000-0000-4000-8000-0000000000d2', name: 'Family' });
const club = makeDeck({ id: '00000000-0000-4000-8000-0000000000d3', name: 'Club', role: 'reader' });

const token = (n: number, overrides: Partial<IngestToken> = {}): IngestToken => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  label: `Token ${n}`,
  prefix: `ing_abc${n}`,
  deckId: null,
  lastUsedAt: null,
  createdAt: STAMP,
  ...overrides,
});

function config(ingest: Partial<AppConfig['ingest']> = {}): AppConfig {
  return {
    cloudinaryCloudName: null,
    commit: 'test',
    search: { semantic: false, ask: false },
    ingest: { enabled: true, emailDomain: null, shortcutUrl: null, ...ingest },
  };
}

function setup({
  tokens = [token(1)],
  ingest = {},
  create = async () => ({ ...token(9, { label: 'Phone' }), token: 'ing_secret9' }),
  isPlatformAdmin = false,
}: {
  tokens?: IngestToken[];
  ingest?: Partial<AppConfig['ingest']>;
  create?: () => Promise<unknown>;
  isPlatformAdmin?: boolean;
} = {}) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /me') {
      const user = { id: 'u1', email: 'me@example.test', displayName: 'Me' };
      return { user, decks: [], isPlatformAdmin };
    }
    if (request === 'GET /me/ingest-tokens') return { data: tokens };
    if (request === 'GET /decks') return { data: [family, club] };
    if (request === 'POST /me/ingest-tokens') return create();
    if (request === 'DELETE /me/ingest-tokens/{id}') return undefined;
    throw new Error(`unexpected ${request}`);
  });
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.config, config(ingest));
  return renderWithClient(<SettingsScreen />, { queryClient });
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('lists tokens with their scope and last use', async () => {
    setup({ tokens: [token(1), token(2, { deckId: family.id, lastUsedAt: STAMP })] });
    const list = await screen.findByRole('list', { name: 'Your tokens' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(/My personal deck/)).toBeInTheDocument();
    expect(within(list).getByText(/Family · Last used/)).toBeInTheDocument();
  });

  it('creates a token bound to a deck and shows it once with its email address', async () => {
    setup({ ingest: { emailDomain: 'in.example.com' } });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: ' Phone ' } });
    const deck = screen.getByLabelText('Shares go to');
    expect(within(deck).queryByRole('option', { name: 'Club' })).toBeNull();
    fireEvent.change(deck, { target: { value: family.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));

    expect(await screen.findByText('ing_secret9')).toBeInTheDocument();
    expect(screen.getByText('secret9@in.example.com')).toBeInTheDocument();
    const call = requests.mock.calls.find(([r]) => r === 'POST /me/ingest-tokens');
    expect((call?.[1] as { body: unknown }).body).toEqual({ label: 'Phone', deckId: family.id });
    expect(screen.getByLabelText('Name')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('ing_secret9')).toBeNull();
  });

  it('shows the API problem when creating fails', async () => {
    setup({
      create: async () => {
        throw new ApiError(409, { title: 'Conflict', detail: 'At most 5 ingest tokens' });
      },
    });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('At most 5 ingest tokens');
  });

  it('disables creating at the token limit', async () => {
    setup({ tokens: [1, 2, 3, 4, 5].map((n) => token(n)) });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Create token' })).toBeDisabled();
    expect(screen.getByText(/the most allowed/)).toBeInTheDocument();
  });

  it('revokes a token only after confirming', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Token 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(respond).not.toHaveBeenCalledWith('DELETE /me/ingest-tokens/{id}');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Token 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke for good' }));
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith('DELETE /me/ingest-tokens/{id}'));
    const call = requests.mock.calls.find(([r]) => r === 'DELETE /me/ingest-tokens/{id}');
    expect(call?.[1]).toEqual({ params: { path: { id: token(1).id } } });
  });

  it('links the Shortcut when configured and warns when ingestion is off', async () => {
    setup({ ingest: { enabled: false, shortcutUrl: 'https://www.icloud.com/shortcuts/abc' } });
    expect(await screen.findByRole('link', { name: /Share to Gobbit/ })).toHaveAttribute(
      'href',
      'https://www.icloud.com/shortcuts/abc',
    );
    expect(screen.getByText(/turned off on this server/)).toBeInTheDocument();
  });

  it('hides the Shortcut and email ways when the server has neither', async () => {
    setup();
    const ways = await screen.findByRole('list', { name: 'Ways to use a token' });
    expect(within(ways).getAllByRole('listitem')).toHaveLength(1);
    expect(within(ways).getByText(/\/api\/ingest$/)).toBeInTheDocument();
    expect(screen.queryByText(/iPhone/)).toBeNull();
    expect(screen.queryByText(/turned off/)).toBeNull();
  });

  it('links the waitlist only for platform admins (032)', async () => {
    setup({ isPlatformAdmin: true });
    expect(await screen.findByRole('link', { name: 'Waitlist' })).toHaveAttribute(
      'href',
      '/admin/waitlist',
    );
  });

  it('shows no waitlist link to everyone else (032)', async () => {
    setup();
    await screen.findByRole('list', { name: 'Your tokens' });
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith('GET /me'));
    expect(screen.queryByRole('link', { name: 'Waitlist' })).toBeNull();
  });

  it('lists the email way with the inbound domain when email-in is on', async () => {
    setup({ ingest: { emailDomain: 'in.example.com' } });
    const ways = await screen.findByRole('list', { name: 'Ways to use a token' });
    expect(within(ways).getAllByRole('listitem')).toHaveLength(2);
    expect(within(ways).getByText('in.example.com')).toBeInTheDocument();
  });
});
