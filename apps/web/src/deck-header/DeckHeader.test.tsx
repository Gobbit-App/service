import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConsent, AppConfig, DeckDetail, Me } from '@gobbit/shared';
import { queryKeys } from '../api/query-keys';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';
import type { DeckHeaderList } from './DeckHeader';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { DeckHeader } = await import('./DeckHeader');

const deck: DeckDetail = {
  ...makeDeck({ id: 'd1', slug: 'family', name: 'Family' }),
  welcome: null,
};
const welcome = {
  membershipId: 'm1',
  inviter: { name: 'Dana', username: null },
} as DeckDetail['welcome'];
const decks = [deck, makeDeck({ id: 'd2', slug: 'me', name: 'Niran', kind: 'personal' })];
const categories = [
  makeCategory({ name: 'General', slug: 'general', position: 0, isDefault: true }),
  makeCategory({ name: 'Recipes', slug: 'recipes', position: 1, isDefault: false }),
];

function list(overrides: Partial<DeckHeaderList> = {}): DeckHeaderList {
  return { categories, view: { kind: 'all' }, query: '', onSearch: vi.fn(), ...overrides };
}

function renderHeader(props: { deck?: DeckDetail; list?: DeckHeaderList | null } = {}) {
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
    const reader: DeckDetail = { ...deck, role: 'reader' };
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

  describe('welcome (D483)', () => {
    const invited = { ...deck, welcome };

    const consent = (value: AnalyticsConsent['value']): AnalyticsConsent => ({
      value,
      at: null,
      source: null,
    });
    const site = { siteId: 'site-1', host: 'gobbit.example' };

    function renderGated(opts: {
      me?: AnalyticsConsent | null;
      analytics?: AppConfig['analytics'] | null;
    }) {
      const queryClient = testQueryClient();
      if (opts.analytics !== null) {
        queryClient.setQueryData(queryKeys.config, {
          analytics: opts.analytics ?? null,
        } as AppConfig);
      }
      if (opts.me) {
        queryClient.setQueryData(queryKeys.me, { analyticsConsent: opts.me } as Me);
      }
      const base = respond.getMockImplementation()!;
      respond.mockImplementation((request) =>
        request === 'GET /me' || request === 'GET /config' ? new Promise(() => {}) : base(request),
      );
      return renderWithClient(<DeckHeader deck={invited} back="/" list={list()} />, {
        queryClient,
      });
    }

    it('mounts on list views only', () => {
      renderGated({ me: consent('declined'), analytics: site });
      expect(screen.getByRole('dialog', { name: /Welcome to/ })).toBeInTheDocument();
    });

    it('waits while me or config is loading', () => {
      renderGated({ analytics: null });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('waits while only config is loading', () => {
      renderGated({ me: consent('declined'), analytics: null });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('waits while only me is loading', () => {
      renderGated({ analytics: site });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each([true, false])(
      'waits for the consent answer with analytics on (online: %s)',
      (online) => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
        renderGated({ me: consent('unanswered'), analytics: site });
        expect(screen.queryByRole('dialog')).toBeNull();
        vi.restoreAllMocks();
      },
    );

    it.each([true, false])('shows once consent is answered (online: %s)', (online) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
      renderGated({ me: consent('allowed'), analytics: site });
      expect(screen.getByRole('dialog', { name: /Welcome to/ })).toBeInTheDocument();
      vi.restoreAllMocks();
    });

    it('shows with analytics off even when consent is unanswered', () => {
      renderGated({ me: consent('unanswered'), analytics: undefined });
      expect(screen.getByRole('dialog', { name: /Welcome to/ })).toBeInTheDocument();
    });

    it('is absent off the lists and when not set', () => {
      renderHeader({ deck: invited, list: null });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('is absent while its dismissal is pending, and re-sends the DELETE', async () => {
      const { addPendingDismissal } = await import('./welcome-store');
      addPendingDismissal('m1');
      respond.mockResolvedValue({});
      renderHeader({ deck: invited, list: list() });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(respond).toHaveBeenCalledWith('DELETE /decks/{id}/welcome');
    });
  });
});
