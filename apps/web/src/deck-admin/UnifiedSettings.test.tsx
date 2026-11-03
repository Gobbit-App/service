import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
vi.mock('../settings/SettingsScreen', () => ({
  SettingsScreen: () => <h3>Account sections</h3>,
}));
const { respond } = await import('../test/api-mock');
const { UnifiedSettings } = await import('./UnifiedSettings');

describe('UnifiedSettings (D278)', () => {
  beforeEach(() => {
    respond.mockReset();
    respond.mockImplementation(async (request) => {
      if (request === 'GET /decks/{id}') return makeDeck({ role: 'editor' });
      if (request === 'GET /decks/{id}/categories') return { data: [makeCategory()] };
      if (request === 'GET /me') return { user: { id: 'user-me' }, decks: [] };
      if (request === 'GET /decks/{id}/members') return { data: [] };
      throw new Error(`unexpected ${request}`);
    });
  });

  it('shows the deck half first, then the account half', async () => {
    renderWithClient(<UnifiedSettings deckSlug="family" />);
    await screen.findByText('Only admins can change this deck.');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('This deck');
    expect(headings.at(-1)).toBe('Your account');
    const account = screen.getByRole('region', { name: 'Your account' });
    expect(account).toContainElement(screen.getByRole('heading', { name: 'Account sections' }));
  });
});
