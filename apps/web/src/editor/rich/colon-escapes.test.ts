import { describe, expect, it } from 'vitest';
import { unescapeHarmlessColons } from './colon-escapes';

describe('unescapeHarmlessColons', () => {
  it.each([
    ['10\\:30', '10:30'],
    ['שעה\\:עשר', 'שעה:עשר'],
    ['a\\: b', 'a: b'],
    ['Re\\:Plan', 'Re\\:Plan'],
    ['a\\\\:30', 'a\\\\:30'],
    ['a\\\\\\:30', 'a\\\\:30'],
    ['plain', 'plain'],
  ])('%s → %s', (input, expected) => {
    expect(unescapeHarmlessColons(input)).toBe(expected);
  });
});
