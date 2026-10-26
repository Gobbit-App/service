import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deckQuery } from '../../api/queries';
import { makeDeck, makeItem } from '../../test/fixtures';
import { renderWithClient, testQueryClient } from '../../test/render';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../../test/api-mock');
const { ContentPane } = await import('./ContentPane');

describe('ContentPane', () => {
  it('keeps the list card actions: favorite, share and the card page (FR-016)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({ id: 'i1', title: 'Bus times' });
    const { navigate } = renderWithClient(
      <ContentPane item={item} deckSlug="family" categories={[]} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Bus times' })).toHaveAttribute(
      'id',
      'card-title-i1',
    );
    expect(screen.getByRole('button', { name: /favorite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Bus times' }));
    expect(navigate).toHaveBeenCalledWith('/i/i1');
  });

  it('adds Edit for roles that may change the card (D213)', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({ id: 'i1', title: 'Bus times' });
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      deckQuery('family').queryKey,
      makeDeck({ slug: 'family', role: 'editor' }),
    );
    renderWithClient(<ContentPane item={item} deckSlug="family" categories={[]} />, {
      queryClient,
    });

    const bar = screen.getByRole('group', { name: 'Card actions' });
    expect(bar).toContainElement(screen.getByRole('link', { name: 'Edit' }));
  });
});
