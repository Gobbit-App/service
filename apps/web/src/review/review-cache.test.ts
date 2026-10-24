import { describe, expect, it } from 'vitest';
import type { Item, ReviewCount, ReviewEntry, ReviewList } from '@pb/shared';
import {
  decrementCount,
  removeReviewEntries,
  removeReviewEntry,
  replaceReviewItem,
} from './review-cache';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'p1',
    deckId: 'd',
    type: 'text',
    status: 'proposed',
    title: 'Dan',
    body: '',
    payload: {},
    entities: {},
    sourceUrl: null,
    sourceKind: 'manual',
    verifiedAt: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    categoryIds: [],
    isFavorite: false,
    ...overrides,
  } as Item;
}

function entry(i: Item): ReviewEntry {
  return { item: i, job: null, target: null };
}

describe('review-cache', () => {
  describe('removeReviewEntry', () => {
    it('returns undefined when list is undefined', () => {
      expect(removeReviewEntry(undefined, 'p1')).toBeUndefined();
    });

    it('removes the matching entry and decrements count', () => {
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' })), entry(item({ id: 'p2' }))],
        count: 5,
      };

      const result = removeReviewEntry(list, 'p1');

      expect(result!.data).toHaveLength(1);
      expect(result!.data[0].item.id).toBe('p2');
      expect(result!.count).toBe(4);
    });

    it('returns the same reference when the id is unknown', () => {
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' }))],
        count: 1,
      };

      expect(removeReviewEntry(list, 'unknown-id')).toBe(list);
    });

    it('never lets count drop below 0', () => {
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' }))],
        count: 0,
      };

      const result = removeReviewEntry(list, 'p1');

      expect(result!.data).toHaveLength(0);
      expect(result!.count).toBe(0);
    });
  });

  describe('removeReviewEntries (D191)', () => {
    it('removes every listed entry and lowers the count by the number removed', () => {
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' })), entry(item({ id: 'p2' })), entry(item({ id: 'p3' }))],
        count: 7,
      };

      const result = removeReviewEntries(list, ['p1', 'p3', 'gone']);

      expect(result!.data.map((e) => e.item.id)).toEqual(['p2']);
      expect(result!.count).toBe(5);
    });

    it('returns the same reference when nothing matches', () => {
      const list: ReviewList = { data: [entry(item({ id: 'p1' }))], count: 1 };
      expect(removeReviewEntries(list, ['x'])).toBe(list);
    });
  });

  describe('decrementCount', () => {
    it('decrements by a given amount, never below 0', () => {
      expect(decrementCount({ count: 3 }, 2)).toEqual({ count: 1 });
      expect(decrementCount({ count: 3 }, 5)).toEqual({ count: 0 });
    });

    it('returns undefined when count is undefined', () => {
      expect(decrementCount(undefined)).toBeUndefined();
    });

    it('decrements a positive count', () => {
      const count: ReviewCount = { count: 3 };

      expect(decrementCount(count)).toEqual({ count: 2 });
    });

    it('keeps a zero count at zero', () => {
      const count: ReviewCount = { count: 0 };

      expect(decrementCount(count)).toEqual({ count: 0 });
    });
  });

  describe('replaceReviewItem', () => {
    it('returns undefined when list is undefined', () => {
      expect(replaceReviewItem(undefined, item({ id: 'p1' }))).toBeUndefined();
    });

    it('replaces the matching entry item and keeps its job and target', () => {
      const job = { id: 'j1' } as never;
      const target = null;
      const original = item({ id: 'p1', title: 'Old' });
      const updated = item({ id: 'p1', title: 'New' });
      const list: ReviewList = {
        data: [{ item: original, job, target }],
        count: 1,
      };

      const result = replaceReviewItem(list, updated);

      expect(result!.data[0].item).toBe(updated);
      expect(result!.data[0].job).toBe(job);
      expect(result!.data[0].target).toBe(target);
    });

    it('keeps untouched entries by reference', () => {
      const untouched = entry(item({ id: 'p2' }));
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' })), untouched],
        count: 2,
      };

      const result = replaceReviewItem(list, item({ id: 'p1', title: 'Edited' }));

      expect(result!.data[1]).toBe(untouched);
    });

    it('returns the same list reference when the id is unknown', () => {
      const list: ReviewList = {
        data: [entry(item({ id: 'p1' }))],
        count: 1,
      };

      expect(replaceReviewItem(list, item({ id: 'unknown-id' }))).toBe(list);
    });
  });
});
