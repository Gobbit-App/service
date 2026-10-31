import { fireEvent, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { SearchResults } = await import('./SearchResults');

const hits = [
  { item: makeItem({ id: 'a', title: 'Pancakes' }), why: 'semantic', score: 0.9 },
  { item: makeItem({ id: 'b', title: 'Waffles' }), why: 'both', score: 0.8 },
];

function props(overrides: Partial<Parameters<typeof SearchResults>[0]> = {}) {
  return {
    deckSlug: 'family',
    categories: [],
    online: true,
    recent: [],
    onPickRecent: vi.fn(),
    ...overrides,
  };
}

describe('SearchResults', () => {
  beforeEach(() => respond.mockReset());
  afterEach(() => onlineManager.setOnline(true));

  it('renders each hit with its result tag', async () => {
    respond.mockResolvedValueOnce({ data: hits, semantic: true });
    renderWithClient(<SearchResults {...props()} q="recipe" />);

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    expect(screen.getByText('Waffles')).toBeInTheDocument();
    expect(screen.getByTitle('Matched the meaning')).toBeInTheDocument();
    expect(screen.getByTitle('Matched the words')).toBeInTheDocument();
  });

  it('shows the no-match copy when there are zero hits', async () => {
    respond.mockResolvedValueOnce({ data: [], semantic: false });
    renderWithClient(<SearchResults {...props()} q="zebra" />);

    expect(await screen.findByText(/No cards match/)).toBeInTheDocument();
    expect(screen.getByText('Try fewer or different words.')).toBeInTheDocument();
  });

  it('lists recent searches for a blank query and picks one on click', () => {
    const onPickRecent = vi.fn();
    renderWithClient(
      <SearchResults {...props({ recent: ['banana bread', 'soup'], onPickRecent })} q="  " />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'banana bread' }));
    expect(onPickRecent).toHaveBeenCalledWith('banana bread');
    expect(respond).not.toHaveBeenCalled();
  });

  it('shows the prompt for a blank query with no recents', () => {
    renderWithClient(<SearchResults {...props()} q="" />);
    expect(screen.getByText('Search this deck')).toBeInTheDocument();
  });

  it('shows the connection state offline with recents and makes no request', () => {
    onlineManager.setOnline(false);
    renderWithClient(<SearchResults {...props({ online: false, recent: ['soup'] })} q="recipe" />);

    expect(screen.getByText('Search needs a connection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'soup' })).toBeInTheDocument();
    expect(respond).not.toHaveBeenCalled();
  });

  it('shows the connection state when the request fails with a network error', async () => {
    respond.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWithClient(<SearchResults {...props()} q="recipe" />);

    expect(await screen.findByText('Search needs a connection')).toBeInTheDocument();
  });

  it('shows the generic error with a retry when the server fails', async () => {
    respond.mockRejectedValueOnce(new ApiError(500, null));
    renderWithClient(<SearchResults {...props()} q="recipe" />);

    expect(await screen.findByText('Something went wrong searching.')).toBeInTheDocument();
  });
});
