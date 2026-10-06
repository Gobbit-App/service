import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond: unwrap } = await import('../test/api-mock');
const { Card, itemCategories } = await import('./Card');

const school = makeCategory({ id: 'c-school', slug: 'school', name: 'School', isDefault: false });
const food = makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false });

describe('itemCategories', () => {
  it('keeps item order and drops categories the reader cannot see', () => {
    const item = makeItem({ categoryIds: ['c-food', 'c-hidden', 'c-school'] });
    expect(itemCategories(item, [school, food]).map((c) => c.slug)).toEqual(['food', 'school']);
  });
});

describe('Card', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  it('shows title, chips and checked-ago, and navigates in-app', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    const item = makeItem({
      id: 'i1',
      title: 'Bus times',
      categoryIds: ['c-school'],
      verifiedAt: '2026-02-15T00:00:00.000Z',
    });
    const { navigate } = renderWithClient(
      <Card item={item} deckSlug="family" categories={[school]} now={now} />,
    );

    expect(screen.getByRole('article', { name: 'Bus times' })).toBeInTheDocument();
    expect(screen.getByText(/^checked 2 weeks ago$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'School' }));
    expect(navigate).toHaveBeenCalledWith('/d/family/c/school');
    fireEvent.click(screen.getByRole('link', { name: 'Bus times' }));
    expect(navigate).toHaveBeenCalledWith('/i/i1');
  });

  it('renders a plain title when linkTitle is off', () => {
    unwrap.mockReturnValue(new Promise(() => undefined));
    renderWithClient(
      <Card
        item={makeItem({ title: 'Solo' })}
        deckSlug="family"
        categories={[]}
        linkTitle={false}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Solo' })).not.toBeInTheDocument();
  });

  it('sends the favorite toggle', async () => {
    unwrap.mockResolvedValue(undefined);
    renderWithClient(
      <Card item={makeItem({ id: 'i1', isFavorite: false })} deckSlug="family" categories={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() => expect(unwrap).toHaveBeenCalled());
  });
});
