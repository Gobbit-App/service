import { describe, expect, it, vi } from 'vitest';
import { RECENT_SEARCHES_MAX } from '@gobbit/shared';
import { pushRecentSearch, readRecentSearches, recentSearchesKey } from './recent-searches';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: vi.fn((k: string) => map.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
  };
}

describe('recent-searches', () => {
  it('puts the newest search first', () => {
    const storage = fakeStorage();
    pushRecentSearch('deck', 'apple', storage);
    const list = pushRecentSearch('deck', 'banana', storage);
    expect(list).toEqual(['banana', 'apple']);
    expect(readRecentSearches('deck', storage)).toEqual(['banana', 'apple']);
  });

  it('dedupes case-insensitively and keeps the newest spelling', () => {
    const storage = fakeStorage();
    pushRecentSearch('deck', 'Milk', storage);
    pushRecentSearch('deck', 'eggs', storage);
    const list = pushRecentSearch('deck', 'milk', storage);
    expect(list).toEqual(['milk', 'eggs']);
  });

  it('caps the list at RECENT_SEARCHES_MAX', () => {
    const storage = fakeStorage();
    let list: string[] = [];
    for (let i = 0; i < RECENT_SEARCHES_MAX + 5; i++) {
      list = pushRecentSearch('deck', `term ${i}`, storage);
    }
    expect(list).toHaveLength(RECENT_SEARCHES_MAX);
    expect(list[0]).toBe(`term ${RECENT_SEARCHES_MAX + 4}`);
    expect(readRecentSearches('deck', storage)).toHaveLength(RECENT_SEARCHES_MAX);
  });

  it('ignores blank queries and does not write', () => {
    const storage = fakeStorage();
    pushRecentSearch('deck', 'apple', storage);
    storage.setItem.mockClear();
    const list = pushRecentSearch('deck', '   ', storage);
    expect(list).toEqual(['apple']);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('returns [] for corrupt JSON', () => {
    const storage = fakeStorage({ [recentSearchesKey('deck')]: '{not json' });
    expect(readRecentSearches('deck', storage)).toEqual([]);
  });

  it('returns [] for a non-array JSON value', () => {
    const storage = fakeStorage({ [recentSearchesKey('deck')]: '{"a":1}' });
    expect(readRecentSearches('deck', storage)).toEqual([]);
  });

  it('returns [] when getItem throws', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
    };
    expect(readRecentSearches('deck', storage)).toEqual([]);
  });

  it('still returns the new list when setItem throws', () => {
    const base = fakeStorage();
    const storage = {
      getItem: base.getItem,
      setItem: vi.fn(() => {
        throw new Error('quota');
      }),
    };
    expect(pushRecentSearch('deck', 'apple', storage)).toEqual(['apple']);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('uses separate keys for separate decks', () => {
    const storage = fakeStorage();
    pushRecentSearch('alpha', 'one', storage);
    pushRecentSearch('beta', 'two', storage);
    expect(readRecentSearches('alpha', storage)).toEqual(['one']);
    expect(readRecentSearches('beta', storage)).toEqual(['two']);
    expect(storage.map.has(recentSearchesKey('alpha'))).toBe(true);
    expect(storage.map.has(recentSearchesKey('beta'))).toBe(true);
    expect(recentSearchesKey('alpha')).not.toBe(recentSearchesKey('beta'));
  });
});
