import { describe, expect, it } from 'vitest';
import type { Entities, Item } from '@gobbit/shared';
import { entitiesText, reviewDiff } from './review-diff';

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

describe('reviewDiff (D106)', () => {
  it('returns no changes for identical items', () => {
    const a = item();
    expect(reviewDiff(a, item())).toEqual([]);
  });

  it('reports a title change with target as before and proposal as after', () => {
    const result = reviewDiff(item({ title: 'New' }), item({ title: 'Old' }));
    expect(result).toEqual([{ field: 'title', label: 'Title', before: 'Old', after: 'New' }]);
  });

  it('ignores whitespace-only differences', () => {
    const result = reviewDiff(item({ body: ' a\n' }), item({ body: 'a' }));
    expect(result).toEqual([]);
  });

  it('reports a link url change from payload.url', () => {
    const result = reviewDiff(
      item({ payload: { url: 'https://b.example/' } }),
      item({ payload: { url: 'https://a.example/' } }),
    );
    expect(result).toEqual([
      {
        field: 'url',
        label: 'Link',
        before: 'https://a.example/',
        after: 'https://b.example/',
      },
    ]);
  });

  it('keeps the target source when the proposal has none', () => {
    const result = reviewDiff(item({ sourceUrl: null }), item({ sourceUrl: 'https://t.example/' }));
    expect(result.find((c) => c.field === 'sourceUrl')).toBeUndefined();
  });

  it('reports a source change when the target has no source', () => {
    const result = reviewDiff(item({ sourceUrl: 'https://n.example/' }), item({ sourceUrl: null }));
    expect(result).toEqual([
      { field: 'sourceUrl', label: 'Source', before: '', after: 'https://n.example/' },
    ]);
  });

  it('reports entity changes as joined text', () => {
    const result = reviewDiff(
      item({ entities: { phones: ['1'], hours: ['9-5'] } }),
      item({ entities: { phones: ['1'] } }),
    );
    expect(result).toEqual([{ field: 'entities', label: 'Details', before: '1', after: '1, 9-5' }]);
  });

  it('orders changes title, body, url, sourceUrl, entities', () => {
    const proposal = item({
      title: 'T2',
      body: 'B2',
      payload: { url: 'https://b.example/' },
      sourceUrl: 'https://n.example/',
      entities: { phones: ['2'] },
    });
    const target = item({
      title: 'T1',
      body: 'B1',
      payload: { url: 'https://a.example/' },
      sourceUrl: 'https://t.example/',
      entities: { phones: ['1'] },
    });
    const fields = reviewDiff(proposal, target).map((c) => c.field);
    expect(fields).toEqual(['title', 'body', 'url', 'sourceUrl', 'entities']);
  });
});

describe('entitiesText (D106)', () => {
  it('returns empty string for undefined', () => {
    expect(entitiesText(undefined)).toBe('');
  });

  it('orders kinds canonically regardless of object key order', () => {
    const entities: Entities = { urls: ['u'], phones: ['p'] };
    expect(entitiesText(entities)).toBe('p, u');
  });
});
