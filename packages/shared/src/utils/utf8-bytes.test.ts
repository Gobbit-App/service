import { describe, it, expect } from 'vitest';
import { utf8Bytes, codePointLength } from './utf8-bytes';

describe('utf8Bytes', () => {
  it.each([
    ['abc', 3, 'ASCII'],
    ['שלום', 8, 'Hebrew'],
    ['γεια', 8, 'Greek'],
    ['👍', 4, 'emoji'],
    ['', 0, 'empty string'],
  ])('%s → %i bytes (%s)', (input, expected) => {
    expect(utf8Bytes(input)).toBe(expected);
  });
});

describe('codePointLength', () => {
  it.each([
    ['abc', 3, 'ASCII'],
    ['שלום', 4, 'Hebrew'],
    ['γεια', 4, 'Greek'],
    ['👍', 1, 'emoji'],
    ['👨‍👩‍👧', 5, 'family emoji'],
    ['', 0, 'empty string'],
  ])('%s → %i code points (%s)', (input, expected) => {
    expect(codePointLength(input)).toBe(expected);
  });
});
