import { describe, expect, it } from 'vitest';
import { makeCategory } from '../test/fixtures';
import { deckViews, viewLabel } from './deck-views';

const categories = [
  makeCategory({ name: 'Science', slug: 'science', position: 2, isDefault: false }),
  makeCategory({ name: 'General', slug: 'general', position: 0, isDefault: true }),
  makeCategory({ name: 'History', slug: 'history', position: 1, isDefault: false }),
];

describe('deckViews', () => {
  it('lists All, Favorites, then the categories in chip order', () => {
    expect(deckViews(categories, { showArchived: false, showLinks: false })).toEqual([
      { kind: 'all' },
      { kind: 'favorites' },
      { kind: 'category', slug: 'general' },
      { kind: 'category', slug: 'history' },
      { kind: 'category', slug: 'science' },
    ]);
  });

  it('adds Archived and Links to check last, only when allowed', () => {
    const views = deckViews([], { showArchived: true, showLinks: true });
    expect(views.map((v) => v.kind)).toEqual(['all', 'favorites', 'archived', 'links']);
    expect(deckViews([], { showArchived: false, showLinks: true }).map((v) => v.kind)).toEqual([
      'all',
      'favorites',
      'links',
    ]);
  });
});

describe('viewLabel', () => {
  it('names the fixed views', () => {
    expect(viewLabel({ kind: 'all' }, [])).toBe('All');
    expect(viewLabel({ kind: 'favorites' }, [])).toBe('Favorites');
    expect(viewLabel({ kind: 'archived' }, [])).toBe('Archived');
    expect(viewLabel({ kind: 'links' }, [])).toBe('Links to check');
  });

  it('uses the category name, or its slug while categories load', () => {
    expect(viewLabel({ kind: 'category', slug: 'history' }, categories)).toBe('History');
    expect(viewLabel({ kind: 'category', slug: 'recipes' }, [])).toBe('recipes');
  });
});
