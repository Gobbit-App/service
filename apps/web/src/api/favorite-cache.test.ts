import { describe, it, expect } from 'vitest';
import {
  setFavoriteInPages,
  setFavoriteOnItem,
  removeFromPages,
  type PagesData,
} from './favorite-cache';
import { makeItem } from '../test/fixtures';

describe('favorite-cache', () => {
  describe('setFavoriteInPages', () => {
    it('returns undefined when data is undefined', () => {
      expect(setFavoriteInPages(undefined, 'item-1', true)).toBeUndefined();
    });

    it('flips isFavorite flag for matching item', () => {
      const item1 = makeItem({ id: 'item-1', isFavorite: false });
      const item2 = makeItem({ id: 'item-2', isFavorite: false });
      const data: PagesData = {
        pages: [
          { data: [item1, item2], nextCursor: 'cursor-1' },
          { data: [makeItem({ id: 'item-3' })], nextCursor: null },
        ],
        pageParams: ['param-1'],
      };

      const result = setFavoriteInPages(data, 'item-1', true);

      expect(result).toBeDefined();
      expect(result!.pages[0].data[0].isFavorite).toBe(true);
      expect(result!.pages[0].data[0].id).toBe('item-1');
    });

    it('keeps untouched items and pages by reference', () => {
      const item1 = makeItem({ id: 'item-1', isFavorite: false });
      const item2 = makeItem({ id: 'item-2', isFavorite: false });
      const item3 = makeItem({ id: 'item-3' });
      const originalPage1 = { data: [item1, item2], nextCursor: 'cursor-1' };
      const originalPage2 = { data: [item3], nextCursor: null };
      const data: PagesData = {
        pages: [originalPage1, originalPage2],
        pageParams: ['param-1'],
      };

      const result = setFavoriteInPages(data, 'item-1', true);

      expect(result!.pages[0]).not.toBe(originalPage1);
      expect(result!.pages[0].data[1]).toBe(item2);
      expect(result!.pages[1]).toBe(originalPage2);
      expect(result!.pageParams).toBe(data.pageParams);
    });

    it('returns data with same item references when id not found', () => {
      const item1 = makeItem({ id: 'item-1', isFavorite: false });
      const data: PagesData = {
        pages: [{ data: [item1], nextCursor: null }],
        pageParams: ['param-1'],
      };

      const result = setFavoriteInPages(data, 'unknown-id', true);

      expect(result).toEqual(data);
      expect(result!.pages[0].data[0]).toBe(item1);
    });
  });

  describe('setFavoriteOnItem', () => {
    it('returns undefined when item is undefined', () => {
      expect(setFavoriteOnItem(undefined, 'item-1', true)).toBeUndefined();
    });

    it('sets isFavorite flag and returns new object', () => {
      const item = makeItem({ id: 'item-1', isFavorite: false });
      const result = setFavoriteOnItem(item, 'item-1', true);

      expect(result).toBeDefined();
      expect(result).not.toBe(item);
      expect(result!.isFavorite).toBe(true);
      expect(result!.id).toBe('item-1');
    });

    it('flips the flag from true to false', () => {
      const item = makeItem({ id: 'item-1', isFavorite: true });
      const result = setFavoriteOnItem(item, 'item-1', false);

      expect(result!.isFavorite).toBe(false);
      expect(result).not.toBe(item);
    });

    it('returns the same object for another item or an unchanged flag', () => {
      const item = makeItem({ id: 'item-1', isFavorite: true });

      expect(setFavoriteOnItem(item, 'item-2', false)).toBe(item);
      expect(setFavoriteOnItem(item, 'item-1', true)).toBe(item);
    });
  });

  describe('removeFromPages', () => {
    it('returns undefined when data is undefined', () => {
      expect(removeFromPages(undefined, 'item-1')).toBeUndefined();
    });

    it('removes item from pages', () => {
      const item1 = makeItem({ id: 'item-1' });
      const item2 = makeItem({ id: 'item-2' });
      const item3 = makeItem({ id: 'item-3' });
      const data: PagesData = {
        pages: [
          { data: [item1, item2], nextCursor: 'cursor-1' },
          { data: [item3], nextCursor: null },
        ],
        pageParams: ['param-1'],
      };

      const result = removeFromPages(data, 'item-1');

      expect(result!.pages[0].data).toHaveLength(1);
      expect(result!.pages[0].data[0]).toBe(item2);
    });

    it('maintains nextCursor values and untouched pages', () => {
      const item1 = makeItem({ id: 'item-1' });
      const item2 = makeItem({ id: 'item-2' });
      const originalPage2 = {
        data: [item2],
        nextCursor: 'cursor-2',
      };
      const data: PagesData = {
        pages: [{ data: [item1], nextCursor: 'cursor-1' }, originalPage2],
        pageParams: ['param-1'],
      };

      const result = removeFromPages(data, 'item-1');

      expect(result!.pages[0].nextCursor).toBe('cursor-1');
      expect(result!.pages[1]).toBe(originalPage2);
    });
  });
});
