import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../lib/last-deck';
import { BROWSE_HINT_KEY, dismissHint, shouldShowHint } from './hint-store';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('browse hint store', () => {
  it('shows the hint until it is dismissed', () => {
    const store = memoryStore();
    expect(shouldShowHint(store)).toBe(true);
    dismissHint(store);
    expect(store.getItem(BROWSE_HINT_KEY)).toBe('dismissed');
    expect(shouldShowHint(store)).toBe(false);
  });

  it('shows the hint for any other stored value', () => {
    const store = memoryStore();
    store.setItem(BROWSE_HINT_KEY, 'yes');
    expect(shouldShowHint(store)).toBe(true);
  });

  it('shows the hint and never throws when storage fails', () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(shouldShowHint(throwing)).toBe(true);
    expect(() => dismissHint(throwing)).not.toThrow();
    expect(shouldShowHint(null)).toBe(true);
    expect(() => dismissHint(null)).not.toThrow();
  });
});
