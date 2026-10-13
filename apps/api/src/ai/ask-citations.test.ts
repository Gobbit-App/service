import { describe, expect, it } from 'vitest';
import { resolveCitations } from './ask-citations';

const cards = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Beta' },
  { id: 'c', title: 'Gamma' },
];

describe('resolveCitations', () => {
  it('keeps known ids in citation order with their titles', () => {
    expect(resolveCitations(['c', 'a'], cards)).toEqual([
      { itemId: 'c', title: 'Gamma' },
      { itemId: 'a', title: 'Alpha' },
    ]);
  });

  it('drops ids that were not retrieved', () => {
    expect(resolveCitations(['x', 'b', 'missing'], cards)).toEqual([
      { itemId: 'b', title: 'Beta' },
    ]);
  });

  it('de-duplicates repeated citations, keeping the first position', () => {
    expect(resolveCitations(['b', 'a', 'b', 'a', 'c'], cards)).toEqual([
      { itemId: 'b', title: 'Beta' },
      { itemId: 'a', title: 'Alpha' },
      { itemId: 'c', title: 'Gamma' },
    ]);
  });

  it('returns an empty array when nothing is cited', () => {
    expect(resolveCitations([], cards)).toEqual([]);
  });

  it('returns an empty array when no cards were retrieved', () => {
    expect(resolveCitations(['a'], [])).toEqual([]);
  });
});
