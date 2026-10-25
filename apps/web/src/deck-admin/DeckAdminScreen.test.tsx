import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@pb/shared';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { DeckAdminScreen } = await import('./DeckAdminScreen');
const { DeckSettingsLink } = await import('./DeckSettingsLink');

function setup(deck: Partial<Deck> = {}) {
  respond.mockImplementation(async (request) => {
    if (request === 'GET /decks/{id}') return makeDeck(deck);
    if (request === 'GET /decks/{id}/categories') return { data: [makeCategory()] };
    if (request === 'GET /me') return { user: { id: 'user-me' }, decks: [] };
    if (request === 'GET /decks/{id}/members') return { data: [] };
    throw new Error(`unexpected ${request}`);
  });
  return renderWithClient(<DeckAdminScreen deckSlug="family" />);
}

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('DeckAdminScreen (D184)', () => {
  beforeEach(() => {
    respond.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('an owner gets Deck, Categories and Members with the public switch', async () => {
    setup();
    expect(await screen.findByRole('switch', { name: 'Public' })).toBeEnabled();
    expect(headings()).toEqual(['Deck settings', 'Deck', 'Categories', 'Members']);
    expect(await screen.findByRole('button', { name: 'Send invite' })).toBeInTheDocument();
  });

  it('a maintainer gets the same sections, a disabled switch and no invite form', async () => {
    setup({ role: 'maintainer' });
    expect(await screen.findByRole('switch', { name: 'Public' })).toBeDisabled();
    expect(headings()).toEqual(['Deck settings', 'Deck', 'Categories', 'Members']);
    expect(screen.queryByRole('button', { name: 'Send invite' })).toBeNull();
  });

  it.each(['editor', 'reader'] as const)(
    'a %s sees the notice and the member list',
    async (role) => {
      setup({ role });
      expect(await screen.findByText('Only admins can change this deck.')).toBeInTheDocument();
      expect(headings()).toEqual(['Deck settings', 'Members']);
      expect(screen.queryByRole('switch')).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );

  it('the personal deck shows its name only', async () => {
    setup({ isDefault: true, slug: 'me' });
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(headings()).toEqual(['Deck settings', 'Deck']);
    expect(screen.queryByRole('switch', { name: 'Public' })).toBeNull();
    expect(
      screen.getByRole('switch', { name: 'Publish shares from publishers directly' }),
    ).toBeInTheDocument();
  });

  it('offline it says so and disables the controls', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setup();
    expect(await screen.findByText(/You’re offline/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });
});

describe('DeckSettingsLink (D184)', () => {
  it.each([
    ['owner', true],
    ['maintainer', true],
    ['editor', false],
    ['reader', false],
  ] as const)('%s → shown: %s', (role, shown) => {
    render(<DeckSettingsLink deckSlug="family" role={role} />);
    const link = screen.queryByRole('link', { name: 'Deck settings' });
    expect(Boolean(link)).toBe(shown);
    if (link) expect(link).toHaveAttribute('href', '/d/family/settings');
  });
});
