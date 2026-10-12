import { describe, expect, it } from 'vitest';
import { escapeLike, toVectorLiteral } from './search.repo';

describe('escapeLike', () => {
  it('escapes percent signs', () => {
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('escapes underscores', () => {
    expect(escapeLike('snake_case')).toBe('snake\\_case');
  });

  it('escapes backslashes before LIKE metacharacters', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('escapes every metacharacter in one string', () => {
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeLike('hello world 123')).toBe('hello world 123');
    expect(escapeLike('')).toBe('');
  });
});

describe('toVectorLiteral', () => {
  it('formats numbers as a pgvector text literal', () => {
    expect(toVectorLiteral([1, 2.5, -3])).toBe('[1,2.5,-3]');
  });

  it('formats a single element', () => {
    expect(toVectorLiteral([0.25])).toBe('[0.25]');
  });

  it('formats an empty vector as empty brackets', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });
});
