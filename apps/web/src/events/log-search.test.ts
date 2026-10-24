import { describe, expect, it } from 'vitest';
import { parseLogSearch } from './log-search';
import { changesLabel } from './event-copy';

describe('parseLogSearch (D188)', () => {
  it('keeps a uuid item and drops anything else', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(parseLogSearch({ item: id })).toEqual({ item: id });
    expect(parseLogSearch({ item: 'nope' })).toEqual({});
    expect(parseLogSearch({ item: 3 })).toEqual({});
    expect(parseLogSearch({})).toEqual({});
  });
});

describe('changesLabel', () => {
  it('names fields in plain words', () => {
    expect(changesLabel(['title', 'categories', 'sourceUrl'])).toBe('title, categories, source');
    expect(changesLabel([])).toBe('');
  });
});
