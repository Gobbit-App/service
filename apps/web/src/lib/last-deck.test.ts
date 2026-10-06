import { describe, it, expect, vi } from 'vitest';
import {
  LAST_DECK_KEY,
  type KeyValueStore,
  defaultStore,
  readLastDeck,
  writeLastDeck,
  clearLastDeck,
  pickLanding,
} from './last-deck';

describe('last-deck', () => {
  describe('LAST_DECK_KEY', () => {
    it('exports the correct key', () => {
      expect(LAST_DECK_KEY).toBe('gobbit:last-deck');
    });
  });

  describe('defaultStore', () => {
    it('returns storage-like object when available', () => {
      const store = defaultStore();
      expect(store).toBeTruthy();
      expect(store).toHaveProperty('getItem');
      expect(store).toHaveProperty('setItem');
      expect(store).toHaveProperty('removeItem');
    });
  });

  describe('readLastDeck', () => {
    it('returns null when store is null', () => {
      expect(readLastDeck(null)).toBeNull();
    });

    it('reads value from store', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(() => 'my-deck'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      const result = readLastDeck(store);
      expect(result).toBe('my-deck');
      expect(store.getItem).toHaveBeenCalledWith(LAST_DECK_KEY);
    });

    it('returns null when store returns null', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      expect(readLastDeck(store)).toBeNull();
    });

    it('returns null when getItem throws', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(() => {
          throw new Error('Storage unavailable');
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      expect(readLastDeck(store)).toBeNull();
    });
  });

  describe('writeLastDeck', () => {
    it('does nothing when store is null', () => {
      expect(() => writeLastDeck('deck', null)).not.toThrow();
    });

    it('writes value to store', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      writeLastDeck('my-deck', store);
      expect(store.setItem).toHaveBeenCalledWith(LAST_DECK_KEY, 'my-deck');
    });

    it('swallows errors from setItem', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(),
        setItem: vi.fn(() => {
          throw new Error('Quota exceeded');
        }),
        removeItem: vi.fn(),
      };
      expect(() => writeLastDeck('deck', store)).not.toThrow();
    });
  });

  describe('clearLastDeck', () => {
    it('does nothing when store is null', () => {
      expect(() => clearLastDeck(null)).not.toThrow();
    });

    it('removes key from store', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      clearLastDeck(store);
      expect(store.removeItem).toHaveBeenCalledWith(LAST_DECK_KEY);
    });

    it('swallows errors from removeItem', () => {
      const store: KeyValueStore = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(() => {
          throw new Error('Access denied');
        }),
      };
      expect(() => clearLastDeck(store)).not.toThrow();
    });
  });

  describe('pickLanding', () => {
    it('returns last when it is in deckSlugs', () => {
      expect(pickLanding(['a', 'b', 'c'], 'b')).toBe('b');
    });

    it('returns last at any position in list', () => {
      expect(pickLanding(['x', 'y', 'z'], 'x')).toBe('x');
      expect(pickLanding(['x', 'y', 'z'], 'z')).toBe('z');
    });

    it('returns single deck when last is null', () => {
      expect(pickLanding(['only'], null)).toBe('only');
    });

    it('returns single deck when last is stale', () => {
      expect(pickLanding(['only'], 'gone')).toBe('only');
    });

    it('returns null when last is stale with multiple decks', () => {
      expect(pickLanding(['a', 'b'], 'gone')).toBeNull();
    });

    it('returns null with multiple decks and null last', () => {
      expect(pickLanding(['a', 'b'], null)).toBeNull();
    });

    it('returns null with empty list', () => {
      expect(pickLanding([], 'any')).toBeNull();
      expect(pickLanding([], null)).toBeNull();
    });
  });
});
