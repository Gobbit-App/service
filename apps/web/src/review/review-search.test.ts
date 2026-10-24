import { describe, expect, it } from 'vitest';
import { IMPORT_LABEL_MAX } from '@pb/shared/ingest-constants';
import { parseReviewSearch } from './review-search';

describe('parseReviewSearch (D191)', () => {
  it('keeps a trimmed source label', () => {
    expect(parseReviewSearch({ source: ' Street notes.md ' })).toEqual({
      source: 'Street notes.md',
    });
  });

  it('drops a missing, empty, non-string or too long source', () => {
    expect(parseReviewSearch({})).toEqual({});
    expect(parseReviewSearch({ source: '  ' })).toEqual({});
    expect(parseReviewSearch({ source: 3 })).toEqual({});
    expect(parseReviewSearch({ source: 'x'.repeat(IMPORT_LABEL_MAX + 1) })).toEqual({});
  });
});
