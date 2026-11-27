import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, DeckDetail, MemberSummary } from '@gobbit/shared';
import { ROLE_WELCOME } from '@gobbit/shared/authz';
import { ApiError } from '../api/api-error';
import { queryKeys } from '../api/query-keys';
import { browseLayerFromState } from '../browse/browse-layer';
import { listCategoryFromState } from '../browse/browse-params';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { DeckWelcome, useWelcomeRetry } = await import('./DeckWelcome');

// D481: the pending set holds membership ids, not deck ids.
const PENDING_KEY = 'gobbit:welcome-dismissed:v1';
const DELETE = 'DELETE /decks/{id}/welcome';
const pending = (): string[] => JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
const deleteCalls = () => requests.mock.calls.filter(([request]) => request === DELETE);

const inviter = (overrides: Partial<MemberSummary> = {}): MemberSummary => ({
  id: 'u-ruth',
  name: 'Ruth Levi',
  username: 'ruth',
  initials: 'RL',
  photo: null,
  ...overrides,
});

function makeDetail(
  welcome: { inviter: MemberSummary | null } = { inviter: inviter() },
  overrides: Partial<DeckDetail> = {},
): DeckDetail {
  return {
    ...makeDeck({ id: 'd1', slug: 'family', name: 'Family recipes', role: 'reader' }),
    welcome: { membershipId: 'm1', ...welcome },
    ...overrides,
  };
}

function setup({
  deck = makeDetail(),
  categories = [makeCategory({ slug: 'food', name: 'Food' })],
}: { deck?: DeckDetail; categories?: Category[] } = {}) {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.deck(deck.slug), deck);
  queryClient.setQueryData(queryKeys.categories(deck.slug), categories);
  const setSearchOpen = vi.fn();
  renderWithClient(<DeckWelcome deck={deck} setSearchOpen={setSearchOpen} />, { queryClient });
  return {
    queryClient,
    setSearchOpen,
    dialog: screen.getByRole('dialog', { name: /Family recipes/ }),
  };
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  respond.mockReset();
  requests.mockReset();
  respond.mockResolvedValue(undefined);
});

describe('DeckWelcome (053)', () => {
  it('names the deck, the inviter and the role', () => {
    const { dialog } = setup();
    expect(within(dialog).getByRole('heading', { name: /Family recipes/ })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Ruth Levi');
    expect(dialog).toHaveTextContent(ROLE_WELCOME.reader);
  });

  it.each([
    ['the username when there is no name', inviter({ name: null, username: 'ruth' }), 'ruth'],
    ['"A member" when there is neither', inviter({ name: null, username: null }), 'A member'],
  ])('names the inviter by %s', (_label, summary, expected) => {
    const { dialog } = setup({ deck: makeDetail({ inviter: summary }) });
    expect(dialog).toHaveTextContent(expected);
  });

  it('leaves the inviter line out when there is no inviter', () => {
    const { dialog } = setup({ deck: makeDetail({ inviter: null }) });
    expect(dialog).not.toHaveTextContent('invited you');
    expect(dialog).not.toHaveTextContent('A member');
  });

  it('wraps the deck and inviter names in bdi', () => {
    const { dialog } = setup();
    const isolated = Array.from(dialog.querySelectorAll('bdi')).map((el) => el.textContent);
    expect(isolated).toEqual(expect.arrayContaining(['Family recipes', 'Ruth Levi']));
  });

  it('is a labelled dialog that Escape and Start reading dismiss', async () => {
    const first = setup();
    expect(first.dialog).toHaveAccessibleName(/Family recipes/);
    fireEvent(first.dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
  });

  it('dismisses with Start reading', async () => {
    const { queryClient } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(queryClient.getQueryData<DeckDetail>(queryKeys.deck('family'))?.welcome).toBeNull();
  });

  it('leaves Categories out when the deck has no category', () => {
    setup({ categories: [] });
    expect(screen.queryByRole('button', { name: 'Categories' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('opens Browse, then the category list as its own history entry (D484)', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));

    const [browse, layer] = navigate.mock.calls.map(([arg]) => arg);
    expect(browse).toMatchObject({ to: '/d/$slug/browse', params: { slug: 'family' } });
    expect(layer).toMatchObject({ to: '/d/$slug/browse', params: { slug: 'family' } });
    expect(layer.search).toEqual(browse.search);

    const fromList = browse.state({});
    expect(listCategoryFromState(fromList)).toBe(browse.search.c);
    expect(browseLayerFromState(fromList)).toBeNull();
    // The second push keeps what the first one set and adds only the layer.
    const withCategories = layer.state(fromList);
    expect(browseLayerFromState(withCategories)).toBe('categories');
    expect(listCategoryFromState(withCategories)).toBe(browse.search.c);
    expect(deleteCalls()).toHaveLength(1);
  });

  it("opens the header's search sheet with Search", async () => {
    const { setSearchOpen } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(setSearchOpen).toHaveBeenCalledWith(true);
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('on dismiss clears the cached welcome, holds the id until the server answers, and sends the DELETE', async () => {
    let answer: () => void = () => {};
    respond.mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)));
    const { queryClient } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start reading' }));

    expect(queryClient.getQueryData<DeckDetail>(queryKeys.deck('family'))?.welcome).toBeNull();
    expect(pending()).toEqual(['m1']);
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0]?.[1]).toMatchObject({ params: { path: { id: 'd1' } } });

    await act(async () => answer());
    await waitFor(() => expect(pending()).toEqual([]));
  });

  it('keeps the id pending when the DELETE fails offline', async () => {
    respond.mockRejectedValue(new TypeError('Failed to fetch'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(pending()).toEqual(['m1']);
  });
});

describe('useWelcomeRetry (D481, FR-011)', () => {
  function Retry({ deck }: { deck: DeckDetail }) {
    useWelcomeRetry(deck);
    return null;
  }
  const mount = (deck = makeDetail()) => renderWithClient(<Retry deck={deck} />);

  it('re-sends a pending DELETE when the browser comes online and clears the id on 204', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(['m1']));
    respond.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mount();
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(pending()).toEqual(['m1']);

    respond.mockResolvedValue(undefined);
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(deleteCalls()).toHaveLength(2));
    await waitFor(() => expect(pending()).toEqual([]));
  });

  it('clears the id on a 404 too (the deck is gone or unreadable)', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(['m1']));
    respond.mockRejectedValue(new ApiError(404, null));
    mount();
    await waitFor(() => expect(pending()).toEqual([]));
  });

  it('sends nothing for a welcome that is not pending here', async () => {
    mount();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(deleteCalls()).toHaveLength(0);
  });

  it('leaves the id pending on a server error', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(['m1']));
    respond.mockRejectedValue(new ApiError(500, null));
    mount();
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(pending()).toEqual(['m1']);
  });
});
