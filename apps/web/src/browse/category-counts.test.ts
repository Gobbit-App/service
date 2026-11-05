import { describe, expect, it } from 'vitest';
import { itemsQuery } from '../api/queries';
import { makeItem } from '../test/fixtures';
import { testQueryClient } from '../test/render';
import { filterFromCategory } from './browse-params';
import { cardCountLabel, knownCategoryTotal } from './category-counts';

function seed(c: string, pages: { count: number; nextCursor: string | null }[]) {
  const client = testQueryClient();
  client.setQueryData(itemsQuery('family', filterFromCategory(c)).queryKey, {
    pages: pages.map((page, p) => ({
      data: Array.from({ length: page.count }, (_, i) => makeItem({ id: `${c}-${p}-${i}` })),
      nextCursor: page.nextCursor,
    })),
    pageParams: pages.map((_, p) => (p === 0 ? null : `cursor-${p}`)),
  });
  return client;
}

describe('knownCategoryTotal', () => {
  it('counts every loaded card once the last page is in', () => {
    const client = seed('food', [
      { count: 20, nextCursor: 'cursor-1' },
      { count: 3, nextCursor: null },
    ]);
    expect(knownCategoryTotal(client, 'family', 'food')).toBe(23);
  });

  it('is null while more pages exist or nothing is cached', () => {
    const client = seed('food', [{ count: 20, nextCursor: 'cursor-1' }]);
    expect(knownCategoryTotal(client, 'family', 'food')).toBeNull();
    expect(knownCategoryTotal(client, 'family', 'school')).toBeNull();
  });

  it('knows an empty category', () => {
    const client = seed('all', [{ count: 0, nextCursor: null }]);
    expect(knownCategoryTotal(client, 'family', 'all')).toBe(0);
  });
});

describe('cardCountLabel', () => {
  it('says card or cards', () => {
    expect(cardCountLabel(1)).toBe('1 card');
    expect(cardCountLabel(0)).toBe('0 cards');
    expect(cardCountLabel(12)).toBe('12 cards');
  });
});
