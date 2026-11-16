import { describe, expect, it } from 'vitest';
import { checkUsernameShape } from './index';

describe('checkUsernameShape', () => {
  it.each([
    ['ab', 'invalid'],
    ['abc', 'ok'],
    ['a'.repeat(30), 'ok'],
    ['a'.repeat(31), 'invalid'],
    ['.abc', 'invalid'],
    ['-abc', 'invalid'],
    ['_abc', 'invalid'],
    ['a.b-c_d', 'ok'],
    ['a@bc', 'invalid'],
    ['ab c', 'invalid'],
    [' abc', 'invalid'],
    ['jörg', 'invalid'],
    ['Admin', 'reserved'],
    ['GOBBIT', 'reserved'],
  ])('%s -> %s', (v, r) => expect(checkUsernameShape(v)).toBe(r));
});
