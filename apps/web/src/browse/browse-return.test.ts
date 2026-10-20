import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../lib/last-deck';
import {
  BROWSE_OPENER_KEY,
  BROWSE_RETURN_KEY,
  browseReturnRedirect,
  clearBrowseReturn,
  historyIndex,
  readBrowseReturn,
  writeBrowseOpener,
  writeBrowseReturn,
} from './browse-return';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwing: KeyValueStore = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

const entry = { deckSlug: 'family', filterKey: 'category:food', itemId: 'i-1' };

describe('browse return entry', () => {
  it('writes, reads and clears', () => {
    const store = memoryStore();
    writeBrowseReturn(entry, store);
    expect(readBrowseReturn('family', 'category:food', store)).toEqual(entry);
    clearBrowseReturn(store);
    expect(readBrowseReturn('family', 'category:food', store)).toBeNull();
  });

  it('is null for another deck or filter', () => {
    const store = memoryStore();
    writeBrowseReturn(entry, store);
    expect(readBrowseReturn('work', 'category:food', store)).toBeNull();
    expect(readBrowseReturn('family', 'all', store)).toBeNull();
  });

  it('is null for malformed JSON or shapes', () => {
    const store = memoryStore();
    store.data.set(BROWSE_RETURN_KEY, '{not json');
    expect(readBrowseReturn('family', 'category:food', store)).toBeNull();
    store.data.set(BROWSE_RETURN_KEY, JSON.stringify({ deckSlug: 'family', itemId: 3 }));
    expect(readBrowseReturn('family', 'category:food', store)).toBeNull();
    store.data.set(BROWSE_RETURN_KEY, 'null');
    expect(readBrowseReturn('family', 'category:food', store)).toBeNull();
  });

  it('never throws on storage errors or missing storage', () => {
    expect(() => writeBrowseReturn(entry, throwing)).not.toThrow();
    expect(readBrowseReturn('family', 'category:food', throwing)).toBeNull();
    expect(() => clearBrowseReturn(throwing)).not.toThrow();
    expect(readBrowseReturn('family', 'all', null)).toBeNull();
    expect(() => writeBrowseReturn(entry, null)).not.toThrow();
  });
});

describe('browseReturnRedirect (FR-005)', () => {
  const opener = { deckSlug: 'family', filterKey: 'all', historyIndex: 4 };

  function seeded() {
    const store = memoryStore();
    writeBrowseOpener(opener, store);
    writeBrowseReturn(entry, store);
    return store;
  }

  it('sends the opening list on to the category Browse ended on', () => {
    expect(browseReturnRedirect('family', 'all', 4, seeded())).toBe('category:food');
  });

  it('does nothing when Browse ended on the same list', () => {
    const store = memoryStore();
    writeBrowseOpener({ ...opener, filterKey: 'category:food' }, store);
    writeBrowseReturn(entry, store);
    expect(browseReturnRedirect('family', 'category:food', 4, store)).toBeNull();
  });

  it('ignores a later visit, another list or deck, and a missing index', () => {
    const store = seeded();
    expect(browseReturnRedirect('family', 'all', 6, store)).toBeNull();
    expect(browseReturnRedirect('family', 'category:school', 4, store)).toBeNull();
    expect(browseReturnRedirect('work', 'all', 4, store)).toBeNull();
    expect(browseReturnRedirect('family', 'all', null, store)).toBeNull();
  });

  it('needs both the opener and the return entry', () => {
    const store = memoryStore();
    writeBrowseOpener(opener, store);
    expect(browseReturnRedirect('family', 'all', 4, store)).toBeNull();
    const deepLink = seeded();
    writeBrowseOpener(null, deepLink);
    expect(deepLink.data.has(BROWSE_OPENER_KEY)).toBe(false);
    expect(browseReturnRedirect('family', 'all', 4, deepLink)).toBeNull();
  });

  it('is cleared with the return entry and never throws', () => {
    const store = seeded();
    clearBrowseReturn(store);
    expect(store.data.size).toBe(0);
    expect(browseReturnRedirect('family', 'all', 4, throwing)).toBeNull();
    expect(() => writeBrowseOpener(opener, throwing)).not.toThrow();
  });
});

describe('historyIndex', () => {
  it("reads the router's index from history state", () => {
    expect(historyIndex({ __TSR_index: 3, key: 'k' })).toBe(3);
    expect(historyIndex({ __TSR_index: '3' })).toBeNull();
    expect(historyIndex({})).toBeNull();
    expect(historyIndex(null)).toBeNull();
  });
});
