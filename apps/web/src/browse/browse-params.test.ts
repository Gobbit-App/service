import { describe, expect, it } from 'vitest';
import {
  categoryFromFilter,
  categoryFromFilterKey,
  filterFromCategory,
  filterKey,
  fromListState,
  isBrowsePath,
  listCategoryFromState,
  listHref,
  parseBrowseSearch,
} from './browse-params';

describe('parseBrowseSearch', () => {
  it('defaults to All on the content pane with no card', () => {
    expect(parseBrowseSearch({})).toEqual({ c: 'all', pane: 'content' });
  });

  it('keeps valid values', () => {
    expect(parseBrowseSearch({ c: 'food', i: 'abc', pane: 'details' })).toEqual({
      c: 'food',
      i: 'abc',
      pane: 'details',
    });
  });

  it('falls back to content for an unknown pane', () => {
    expect(parseBrowseSearch({ pane: 'history' }).pane).toBe('content');
    expect(parseBrowseSearch({ pane: 3 }).pane).toBe('content');
  });

  it('drops empty, overlong or non-string values', () => {
    expect(parseBrowseSearch({ c: '', i: '  ' })).toEqual({ c: 'all', pane: 'content' });
    expect(parseBrowseSearch({ c: 'x'.repeat(65) }).c).toBe('all');
    expect(parseBrowseSearch({ c: { a: 1 }, i: ['x'] })).toEqual({ c: 'all', pane: 'content' });
  });

  it('reads numeric slugs the router parsed as numbers', () => {
    expect(parseBrowseSearch({ c: 2024 }).c).toBe('2024');
  });
});

describe('c ↔ ItemFilter', () => {
  it('maps all and category slugs both ways', () => {
    expect(filterFromCategory('all')).toEqual({ kind: 'all' });
    expect(filterFromCategory('food')).toEqual({ kind: 'category', slug: 'food' });
    expect(categoryFromFilter({ kind: 'all' })).toBe('all');
    expect(categoryFromFilter({ kind: 'category', slug: 'food' })).toBe('food');
  });

  it('has no c for views Browse does not cycle through', () => {
    expect(categoryFromFilter({ kind: 'favorites' })).toBeNull();
    expect(categoryFromFilter({ kind: 'archived' })).toBeNull();
    expect(categoryFromFilter({ kind: 'deleted' })).toBeNull();
  });

  it('builds the list href Browse closes to', () => {
    expect(listHref('family', 'all')).toBe('/d/family');
    expect(listHref('family', 'food & drink')).toBe('/d/family/c/food%20%26%20drink');
  });

  it('builds filter keys', () => {
    expect(filterKey({ kind: 'all' })).toBe('all');
    expect(filterKey({ kind: 'category', slug: 'food' })).toBe('category:food');
  });
});

describe('listCategoryFromState', () => {
  it('reads the list category from the push state', () => {
    expect(listCategoryFromState({ ...fromListState('food'), __TSR_index: 1 })).toBe('food');
    expect(listCategoryFromState(fromListState('all'))).toBe('all');
  });

  it('is null for anything else', () => {
    expect(listCategoryFromState({ fromList: 'yes', listC: 'food' })).toBeNull();
    expect(listCategoryFromState({ fromList: true })).toBeNull();
    expect(listCategoryFromState(undefined)).toBeNull();
    expect(listCategoryFromState(null)).toBeNull();
  });
});

describe('isBrowsePath', () => {
  it('matches the Browse route only', () => {
    expect(isBrowsePath('/d/family/browse')).toBe(true);
    expect(isBrowsePath('/d/family/browse/')).toBe(true);
    expect(isBrowsePath('/d/family')).toBe(false);
    expect(isBrowsePath('/d/family/c/browse')).toBe(false);
    expect(isBrowsePath('/d/browse')).toBe(false);
  });
});

describe('categoryFromFilterKey', () => {
  it('maps list filter keys back to `c`', () => {
    expect(categoryFromFilterKey('all')).toBe('all');
    expect(categoryFromFilterKey('category:food')).toBe('food');
    expect(categoryFromFilterKey('category:')).toBeNull();
    expect(categoryFromFilterKey('favorites')).toBeNull();
  });
});
