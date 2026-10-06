import { QueryClient } from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import { describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import type { PagesData } from './favorite-cache';
import { queryKeys } from './query-keys';

vi.mock('./client', () => ({ api: {}, unwrap: vi.fn() }));
const { applyFavorite, rollbackFavorite } = await import('./favorites');

const allKey = queryKeys.items('family', { kind: 'all' });
const favKey = queryKeys.items('family', { kind: 'favorites' });

const pages = (...items: Item[]): PagesData => ({
  pages: [{ data: items, nextCursor: null }],
  pageParams: [null],
});

function seed() {
  const qc = new QueryClient();
  const item = makeItem({ id: 'i1', isFavorite: true });
  const other = makeItem({ id: 'i2', isFavorite: false });
  qc.setQueryData(allKey, pages(item, other));
  qc.setQueryData(favKey, pages(item));
  qc.setQueryData(queryKeys.item('i1'), item);
  return qc;
}

describe('applyFavorite', () => {
  it('unfavoriting flips the flag and drops the card from favorites lists', async () => {
    const qc = seed();
    await applyFavorite(qc, { itemId: 'i1', isFavorite: false });

    expect(qc.getQueryData<PagesData>(allKey)!.pages[0].data[0].isFavorite).toBe(false);
    expect(qc.getQueryData<PagesData>(favKey)!.pages[0].data).toHaveLength(0);
    expect(qc.getQueryData<Item>(queryKeys.item('i1'))!.isFavorite).toBe(false);
  });

  it('favoriting flips the flag without inserting into favorites lists', async () => {
    const qc = seed();
    await applyFavorite(qc, { itemId: 'i2', isFavorite: true });

    expect(qc.getQueryData<PagesData>(allKey)!.pages[0].data[1].isFavorite).toBe(true);
    expect(qc.getQueryData<PagesData>(favKey)!.pages[0].data.map((i) => i.id)).toEqual(['i1']);
  });

  it('rollback restores every touched query', async () => {
    const qc = seed();
    const before = qc.getQueryData(favKey);
    const snapshot = await applyFavorite(qc, { itemId: 'i1', isFavorite: false });

    rollbackFavorite(qc, 'i1', snapshot);

    expect(qc.getQueryData(favKey)).toEqual(before);
    expect(qc.getQueryData<Item>(queryKeys.item('i1'))!.isFavorite).toBe(true);
  });
});
