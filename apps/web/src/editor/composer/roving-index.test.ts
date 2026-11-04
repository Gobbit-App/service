import { describe, expect, it } from 'vitest';
import { rovingIndex } from './roving-index';

describe('rovingIndex (D301)', () => {
  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowDown', 2, 3],
    ['ArrowRight', 5, 0],
    ['ArrowLeft', 3, 2],
    ['ArrowUp', 0, 5],
    ['Home', 4, 0],
    ['End', 1, 5],
  ])('%s from %i moves to %i in a group of 6', (key, current, expected) => {
    expect(rovingIndex(key, current, 6)).toBe(expected);
  });

  it('ignores keys that do not move focus', () => {
    expect(rovingIndex('Enter', 2, 6)).toBeNull();
    expect(rovingIndex(' ', 2, 6)).toBeNull();
    expect(rovingIndex('Tab', 2, 6)).toBeNull();
  });

  it('returns null for an empty group', () => {
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull();
  });
});
