import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../api/api-error';
import { BROWSE_RETURN_KEY, writeBrowseOpener, writeBrowseReturn } from '../browse/browse-return';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { ItemList } = await import('./ItemList');

describe('ItemList', () => {
  beforeEach(() => unwrap.mockReset());

  it('renders cards and loads the next page on demand', async () => {
    unwrap
      .mockResolvedValueOnce({ data: [makeItem({ id: 'a', title: 'First' })], nextCursor: 'c1' })
      .mockResolvedValueOnce({ data: [makeItem({ id: 'b', title: 'Second' })], nextCursor: null });

    renderWithClient(<ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />);

    expect(await screen.findByText('First')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
    );
  });

  it('renders per-card actions under each card', async () => {
    unwrap.mockResolvedValue({ data: [makeItem({ id: 'a', title: 'First' })], nextCursor: null });
    renderWithClient(
      <ItemList
        deckSlug="family"
        filter={{ kind: 'archived' }}
        categories={[]}
        renderActions={(item) => <button type="button">{`Act on ${item.title}`}</button>}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Act on First' })).toBeInTheDocument();
  });

  it('shows the view-specific empty state', async () => {
    unwrap.mockResolvedValue({ data: [], nextCursor: null });
    renderWithClient(<ItemList deckSlug="family" filter={{ kind: 'favorites' }} categories={[]} />);
    expect(await screen.findByText('No favorites yet')).toBeInTheDocument();
  });

  it('shows an error with retry when nothing is cached', async () => {
    unwrap.mockRejectedValueOnce(new ApiError(500, null));
    renderWithClient(<ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />);
    expect(await screen.findByText(/went wrong loading these cards/)).toBeInTheDocument();

    unwrap.mockResolvedValueOnce({ data: [makeItem({ title: 'Back' })], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back')).toBeInTheDocument();
  });

  it('explains offline failures', async () => {
    unwrap.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWithClient(<ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />);
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
  });

  describe('back from Browse', () => {
    const scrolled: Element[] = [];
    beforeEach(() => {
      scrolled.length = 0;
      sessionStorage.clear();
      Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
        scrolled.push(this);
      });
    });
    afterEach(() => sessionStorage.clear());

    const twoCards = () =>
      unwrap.mockResolvedValue({
        data: [makeItem({ id: 'a', title: 'First' }), makeItem({ id: 'b', title: 'Second' })],
        nextCursor: null,
      });

    it('scrolls the matching card into view and clears the entry', async () => {
      twoCards();
      writeBrowseReturn({ deckSlug: 'family', filterKey: 'category:food', itemId: 'b' });
      renderWithClient(
        <ItemList deckSlug="family" filter={{ kind: 'category', slug: 'food' }} categories={[]} />,
      );
      await waitFor(() => expect(scrolled).toHaveLength(1));
      expect(scrolled[0]).toBe(screen.getByRole('article', { name: 'Second' }));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      expect(sessionStorage.getItem(BROWSE_RETURN_KEY)).toBeNull();
    });

    it('does nothing without an entry or for another filter', async () => {
      twoCards();
      writeBrowseReturn({ deckSlug: 'family', filterKey: 'category:food', itemId: 'b' });
      renderWithClient(<ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />);
      expect(await screen.findByText('Second')).toBeInTheDocument();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(scrolled).toHaveLength(0);
      expect(sessionStorage.getItem(BROWSE_RETURN_KEY)).not.toBeNull();
    });

    describe('back after a category change (FR-005)', () => {
      beforeEach(() => window.history.replaceState({ __TSR_index: 4 }, ''));
      afterEach(() => window.history.replaceState(null, ''));

      it('replaces the opening list with the category Browse ended on', async () => {
        twoCards();
        writeBrowseOpener({ deckSlug: 'family', filterKey: 'all', historyIndex: 4 });
        writeBrowseReturn({ deckSlug: 'family', filterKey: 'category:food', itemId: 'b' });
        const { navigate } = renderWithClient(
          <ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />,
        );
        await waitFor(() =>
          expect(navigate).toHaveBeenCalledWith('/d/family/c/food', { replace: true }),
        );
        expect(sessionStorage.getItem(BROWSE_RETURN_KEY)).not.toBeNull();
      });

      it('stays on a later visit to the same list', async () => {
        twoCards();
        writeBrowseOpener({ deckSlug: 'family', filterKey: 'all', historyIndex: 2 });
        writeBrowseReturn({ deckSlug: 'family', filterKey: 'category:food', itemId: 'b' });
        const { navigate } = renderWithClient(
          <ItemList deckSlug="family" filter={{ kind: 'all' }} categories={[]} />,
        );
        expect(await screen.findByText('Second')).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
      });
    });
  });
});
