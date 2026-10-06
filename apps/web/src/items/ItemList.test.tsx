import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../api/api-error';
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
});
