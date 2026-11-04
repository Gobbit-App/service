import { describe, expect, it } from 'vitest';
import { parseEditSearch } from './edit-search';

describe('parseEditSearch', () => {
  it('keeps from=review and a safe opener page', () => {
    expect(parseEditSearch({ from: 'review', back: '/d/family/browse?c=all&i=it_1' })).toEqual({
      from: 'review',
      back: '/d/family/browse?c=all&i=it_1',
    });
  });

  it('drops unknown values and unsafe back paths', () => {
    expect(parseEditSearch({ from: 'elsewhere', back: '//evil.example' })).toEqual({});
    expect(parseEditSearch({ back: '/i/it_1/edit' })).toEqual({});
    expect(parseEditSearch({})).toEqual({});
  });
});
