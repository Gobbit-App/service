import { describe, it, expect } from 'vitest';
import type { Category } from '@pb/shared';
import { orderChips, chipHref, viewFromPath, sameView, type ChipView } from './chip-order';

describe('orderChips', () => {
  it('places default category first regardless of position', () => {
    const categories: Category[] = [
      {
        id: '1',
        deckId: 'd1',
        slug: 'archive',
        name: 'Archive',
        visibility: 'private',
        isDefault: false,
        position: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        deckId: 'd1',
        slug: 'main',
        name: 'Main',
        visibility: 'private',
        isDefault: true,
        position: 100,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = orderChips(categories);
    expect(result[0].isDefault).toBe(true);
    expect(result[0].slug).toBe('main');
  });

  it('sorts by position when not default', () => {
    const categories: Category[] = [
      {
        id: '1',
        deckId: 'd1',
        slug: 'z',
        name: 'Z',
        visibility: 'private',
        isDefault: false,
        position: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        deckId: 'd1',
        slug: 'a',
        name: 'A',
        visibility: 'private',
        isDefault: false,
        position: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = orderChips(categories);
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
  });

  it('sorts by name when position is equal', () => {
    const categories: Category[] = [
      {
        id: '1',
        deckId: 'd1',
        slug: 'zebra',
        name: 'Zebra',
        visibility: 'private',
        isDefault: false,
        position: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        deckId: 'd1',
        slug: 'apple',
        name: 'Apple',
        visibility: 'private',
        isDefault: false,
        position: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = orderChips(categories);
    expect(result[0].name).toBe('Apple');
    expect(result[1].name).toBe('Zebra');
  });

  it('does not mutate input', () => {
    const categories: Category[] = [
      {
        id: '1',
        deckId: 'd1',
        slug: 'z',
        name: 'Z',
        visibility: 'private',
        isDefault: false,
        position: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        deckId: 'd1',
        slug: 'a',
        name: 'A',
        visibility: 'private',
        isDefault: false,
        position: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const original = JSON.stringify(categories);
    orderChips(categories);
    expect(JSON.stringify(categories)).toBe(original);
  });
});

describe('chipHref', () => {
  it('builds href for all view', () => {
    expect(chipHref('my-deck', { kind: 'all' })).toBe('/d/my-deck');
  });

  it('builds href for favorites view', () => {
    expect(chipHref('my-deck', { kind: 'favorites' })).toBe('/d/my-deck/favorites');
  });

  it('builds href for archived view', () => {
    expect(chipHref('my-deck', { kind: 'archived' })).toBe('/d/my-deck/archived');
  });

  it('builds href for category view', () => {
    expect(chipHref('my-deck', { kind: 'category', slug: 'tech' })).toBe('/d/my-deck/c/tech');
  });

  it('encodes special characters in deck slug', () => {
    expect(chipHref('my deck', { kind: 'all' })).toBe('/d/my%20deck');
  });

  it('encodes special characters in category slug', () => {
    expect(chipHref('my-deck', { kind: 'category', slug: 'my category' })).toBe(
      '/d/my-deck/c/my%20category',
    );
  });
});

describe('viewFromPath', () => {
  it('parses all view', () => {
    const result = viewFromPath('/d/my-deck');
    expect(result).toEqual({
      deckSlug: 'my-deck',
      view: { kind: 'all' },
    });
  });

  it('parses favorites view', () => {
    const result = viewFromPath('/d/my-deck/favorites');
    expect(result).toEqual({
      deckSlug: 'my-deck',
      view: { kind: 'favorites' },
    });
  });

  it('parses archived view', () => {
    const result = viewFromPath('/d/my-deck/archived');
    expect(result).toEqual({
      deckSlug: 'my-deck',
      view: { kind: 'archived' },
    });
  });

  it('parses category view', () => {
    const result = viewFromPath('/d/my-deck/c/tech');
    expect(result).toEqual({
      deckSlug: 'my-deck',
      view: { kind: 'category', slug: 'tech' },
    });
  });

  it('tolerates trailing slash', () => {
    const result = viewFromPath('/d/my-deck/');
    expect(result).toEqual({
      deckSlug: 'my-deck',
      view: { kind: 'all' },
    });
  });

  it('decodes encoded segments', () => {
    const result = viewFromPath('/d/my%20deck/c/my%20cat');
    expect(result).toEqual({
      deckSlug: 'my deck',
      view: { kind: 'category', slug: 'my cat' },
    });
  });

  it('returns null for invalid path /x', () => {
    expect(viewFromPath('/x')).toBeNull();
  });

  it('returns null for incomplete path /d/a/c', () => {
    expect(viewFromPath('/d/a/c')).toBeNull();
  });

  it('round-trips with chipHref for all', () => {
    const deckSlug = 'my-deck';
    const view: ChipView = { kind: 'all' };
    const href = chipHref(deckSlug, view);
    const parsed = viewFromPath(href);
    expect(parsed?.deckSlug).toBe(deckSlug);
    expect(parsed?.view).toEqual(view);
  });

  it('round-trips with chipHref for favorites', () => {
    const deckSlug = 'my-deck';
    const view: ChipView = { kind: 'favorites' };
    const href = chipHref(deckSlug, view);
    const parsed = viewFromPath(href);
    expect(parsed?.deckSlug).toBe(deckSlug);
    expect(parsed?.view).toEqual(view);
  });

  it('round-trips with chipHref for archived', () => {
    const deckSlug = 'my-deck';
    const view: ChipView = { kind: 'archived' };
    const href = chipHref(deckSlug, view);
    const parsed = viewFromPath(href);
    expect(parsed?.deckSlug).toBe(deckSlug);
    expect(parsed?.view).toEqual(view);
  });

  it('round-trips with chipHref for category', () => {
    const deckSlug = 'my-deck';
    const view: ChipView = { kind: 'category', slug: 'tech' };
    const href = chipHref(deckSlug, view);
    const parsed = viewFromPath(href);
    expect(parsed?.deckSlug).toBe(deckSlug);
    expect(parsed?.view).toEqual(view);
  });
});

describe('sameView', () => {
  it('returns true for same all views', () => {
    expect(sameView({ kind: 'all' }, { kind: 'all' })).toBe(true);
  });

  it('returns true for same favorites views', () => {
    expect(sameView({ kind: 'favorites' }, { kind: 'favorites' })).toBe(true);
  });

  it('returns true for same archived views', () => {
    expect(sameView({ kind: 'archived' }, { kind: 'archived' })).toBe(true);
  });

  it('returns true for same category views with same slug', () => {
    expect(sameView({ kind: 'category', slug: 'tech' }, { kind: 'category', slug: 'tech' })).toBe(
      true,
    );
  });

  it('returns false for same category views with different slugs', () => {
    expect(sameView({ kind: 'category', slug: 'tech' }, { kind: 'category', slug: 'life' })).toBe(
      false,
    );
  });

  it('returns false for different view kinds', () => {
    expect(sameView({ kind: 'all' }, { kind: 'favorites' })).toBe(false);
  });

  it('returns false for category and non-category', () => {
    expect(sameView({ kind: 'all' }, { kind: 'category', slug: 'tech' })).toBe(false);
  });
});
