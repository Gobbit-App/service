import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deckQuery } from '../api/queries';
import { makeDeck, makeItem } from '../test/fixtures';
import { renderWithClient, testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { BrowseDock } = await import('./BrowseDock');

const item = makeItem({ id: 'i1', title: 'Bus times' });

describe('BrowseDock', () => {
  it('offers the card moves and the reader actions (favorite, share)', () => {
    respond.mockReturnValue(new Promise(() => undefined));
    const prev = vi.fn();
    const next = vi.fn();
    renderWithClient(
      <BrowseDock item={item} deckSlug="family" onPrevCard={prev} onNextCard={next} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(prev).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    const bar = screen.getByRole('group', { name: 'Card actions' });
    expect(bar).toContainElement(screen.getByRole('button', { name: /favorite/i }));
    expect(bar).toContainElement(screen.getByRole('button', { name: /share/i }));
  });

  it('keeps a move visible but inert at either end', () => {
    respond.mockReturnValue(new Promise(() => undefined));
    renderWithClient(
      <BrowseDock item={item} deckSlug="family" onPrevCard={null} onNextCard={null} />,
    );
    const prev = screen.getByRole('button', { name: 'Previous card' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(() => fireEvent.click(prev)).not.toThrow();
    expect(screen.getByRole('button', { name: 'Next card' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('adds Edit for roles that may change the card (D213)', () => {
    respond.mockReturnValue(new Promise(() => undefined));
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      deckQuery('family').queryKey,
      makeDeck({ slug: 'family', role: 'editor' }),
    );
    renderWithClient(
      <BrowseDock item={item} deckSlug="family" onPrevCard={null} onNextCard={null} />,
      { queryClient },
    );
    const bar = screen.getByRole('group', { name: 'Card actions' });
    expect(bar).toContainElement(screen.getByRole('link', { name: 'Edit' }));
  });
});
