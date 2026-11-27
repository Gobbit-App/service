import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../lib/last-deck';
import {
  WELCOME_DISMISSED_KEY,
  addPendingDismissal,
  readPendingDismissals,
  removePendingDismissal,
} from './welcome-store';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('welcome store', () => {
  it('uses the versioned key', () => {
    expect(WELCOME_DISMISSED_KEY).toBe('gobbit:welcome-dismissed:v1');
  });

  it('adds, finds and removes membership ids', () => {
    const store = memoryStore();
    expect(readPendingDismissals(store).includes('m1')).toBe(false);
    addPendingDismissal('m1', store);
    addPendingDismissal('m2', store);
    addPendingDismissal('m1', store);
    expect(readPendingDismissals(store)).toEqual(['m1', 'm2']);
    expect(readPendingDismissals(store).includes('m1')).toBe(true);
    removePendingDismissal('m1', store);
    expect(readPendingDismissals(store).includes('m1')).toBe(false);
    expect(readPendingDismissals(store).includes('m2')).toBe(true);
  });

  it('reads a corrupt value as empty and recovers on the next add', () => {
    const store = memoryStore();
    for (const bad of ['{not json', '"m1"', '{"a":1}', '[1,null]']) {
      store.setItem(WELCOME_DISMISSED_KEY, bad);
      expect(readPendingDismissals(store)).toEqual([]);
    }
    addPendingDismissal('m3', store);
    expect(readPendingDismissals(store)).toEqual(['m3']);
  });

  it('is empty and silent without storage', () => {
    expect(readPendingDismissals(null)).toEqual([]);
    expect(() => addPendingDismissal('m1', null)).not.toThrow();
    expect(() => removePendingDismissal('m1', null)).not.toThrow();
  });
});
