import { describe, expect, it } from 'vitest';
import { isSearchPath, showsListTools } from './list-tools';

describe('showsListTools', () => {
  it.each([
    '/d/home',
    '/d/home/',
    '/d/home/favorites',
    '/d/home/archived',
    '/d/home/links',
    '/d/home/c/recipes',
    '/d/home/search',
  ])('shows search and chips on the list view %s', (path) => {
    expect(showsListTools(path)).toBe(true);
  });

  it.each([
    '/d/home/shares',
    '/d/home/review',
    '/d/home/log',
    '/d/home/settings',
    '/d/home/import',
    '/d/home/upcoming',
  ])('hides them on %s', (path) => {
    expect(showsListTools(path)).toBe(false);
  });
});

describe('isSearchPath', () => {
  it('matches only the deck search page', () => {
    expect(isSearchPath('/d/home/search')).toBe(true);
    expect(isSearchPath('/d/search')).toBe(false);
    expect(isSearchPath('/d/home/c/search')).toBe(false);
  });
});
