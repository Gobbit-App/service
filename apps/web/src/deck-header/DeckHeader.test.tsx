import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@gobbit/shared';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import type { DeckHeaderList } from './DeckHeader';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { DeckHeader } = await import('./DeckHeader');

const deck = makeDeck({ id: 'd1', slug: 'family', name: 'Family' });
const decks = [deck, makeDeck({ id: 'd2', slug: 'me', name: 'Niran', kind: 'personal' })];
const categories = [
  makeCategory({ name: 'General', slug: 'general', position: 0, isDefault: true }),
  makeCategory({ name: 'Recipes', slug: 'recipes', position: 1, isDefault: false }),
];

function list(overrides: Partial<DeckHeaderList> = {}): DeckHeaderList {
  return { categories, view: { kind: 'all' }, query: '', onSearch: vi.fn(), ...overrides };
}

function renderHeader(props: { deck?: Deck; list?: DeckHeaderList | null } = {}) {
  return renderWithClient(
    <DeckHeader deck={props.deck ?? deck} back="/?all=true" list={props.list} />,
  );
}

const crumbs = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

beforeEach(() => {
  localStorage.clear();
  respond.mockReset();
  respond.mockImplementation((request) =>
    request === 'GET /decks'
      ? Promise.resolve({ data: decks })
      : Promise.reject(new Error(`unexpected ${request}`)),
  );
});

describe('DeckHeader (D380)', () => {
  it('shows deck and view as one breadcrumb line with Search at the end', () => {
    renderHeader({ list: list({ view: { kind: 'category', slug: 'recipes' } }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Family' })).toBeInTheDocument();
    expect(within(crumbs()).getByRole('link', { name: 'Family' })).toHaveAttribute(
      'href',
      '/d/family',
    );
    expect(within(crumbs()).getByRole('button', { name: 'Category: Recipes' })).toHaveTextContent(
      'Recipes',
    );
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows only the deck crumb off the card lists (no view, no Search)', () => {
    renderHeader({ list: null });
    expect(screen.getByRole('button', { name: 'Switch deck' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Category:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('names the view crumb "Search" on search results', () => {
    renderHeader({ list: list({ view: null, query: 'soup' }) });
    expect(screen.getByRole('button', { name: 'Category: Search' })).toBeInTheDocument();
  });

  it('switches deck from the caret menu, the current deck checked (D381)', async () => {
    const { navigate } = renderHeader({ list: list() });
    await userEvent.click(screen.getByRole('button', { name: 'Switch deck' }));
    const menu = screen.getByRole('menu', { name: 'Switch deck' });
    expect(await within(menu).findByRole('menuitemradio', { name: 'Niran' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Family' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: 'All decks' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Niran' }));
    expect(navigate).toHaveBeenCalledWith('/d/me');
  });

  it('switches view from the category menu, gated by role (D381)', async () => {
    const reader = makeDeck({ ...deck, role: 'reader' });
    const { navigate } = renderHeader({ deck: reader, list: list() });
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }));
    const options = screen.getAllByRole('menuitemradio').map((el) => el.textContent);
    expect(options).toEqual(['All', 'Favorites', 'General', 'Recipes']);
    expect(screen.getByRole('menuitemradio', { name: 'All' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Recipes' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/c/recipes');
  });

  it('lists Archived and Links to check for owners', async () => {
    renderHeader({ list: list() });
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }));
    expect(screen.getByRole('menuitemradio', { name: 'Archived' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Links to check' })).toBeInTheDocument();
  });

  it('Search opens the sheet; a search runs and closes it (D382)', async () => {
    const onSearch = vi.fn();
    renderHeader({ list: list({ onSearch }) });
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const box = screen.getByRole('searchbox', { name: 'Search this deck' });
    expect(box).toHaveFocus();
    await userEvent.type(box, '  soup {Enter}');
    expect(onSearch).toHaveBeenCalledWith('soup');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('/ opens search outside text fields only', () => {
    renderHeader({ list: list() });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('/ does nothing off the card lists', () => {
    renderHeader({ list: null });
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
