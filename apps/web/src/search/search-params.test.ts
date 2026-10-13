import { describe, expect, it } from 'vitest';
import { SEARCH_Q_MAX } from '@pb/shared';
import { parseSearchParams } from './search-params';

describe('parseSearchParams', () => {
  it('reads q and mode', () => {
    expect(parseSearchParams({ q: 'wifi', mode: 'ask' })).toEqual({ q: 'wifi', mode: 'ask' });
  });

  it('defaults to an empty search', () => {
    expect(parseSearchParams({})).toEqual({ q: '', mode: 'search' });
  });

  it('ignores an unknown mode and a non-string q', () => {
    expect(parseSearchParams({ q: 42, mode: 'shout' })).toEqual({ q: '', mode: 'search' });
  });

  it('caps q at the API limit', () => {
    expect(parseSearchParams({ q: 'a'.repeat(SEARCH_Q_MAX + 5) }).q).toHaveLength(SEARCH_Q_MAX);
  });
});
