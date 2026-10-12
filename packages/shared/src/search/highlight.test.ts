import { describe, expect, it } from 'vitest';
import { highlightRanges, highlightSegments } from './highlight';

// שָׁלוֹם (shalom with niqqud: shin dot, qamats, holam)
const HEBREW_POINTED = '\u05E9\u05B8\u05C1\u05DC\u05D5\u05B9\u05DD';
// שלום (plain)
const HEBREW_PLAIN = '\u05E9\u05DC\u05D5\u05DD';
// Καλημέρα with precomposed accented epsilon (U+03AD)
const GREEK_ACCENTED = '\u039A\u03B1\u03BB\u03B7\u03BC\u03AD\u03C1\u03B1';
// λόγος (final sigma U+03C2)
const GREEK_FINAL_SIGMA = '\u03BB\u03CC\u03B3\u03BF\u03C2';

describe('highlightRanges', () => {
  it('matches latin case-insensitively', () => {
    expect(highlightRanges('Hello World', 'hello')).toEqual([[0, 5]]);
    expect(highlightRanges('Hello World', 'WORLD')).toEqual([[6, 11]]);
  });

  it('matches a pointed Hebrew word with a plain query over the whole word', () => {
    expect(HEBREW_POINTED.length).toBe(7);
    expect(highlightRanges(HEBREW_POINTED, HEBREW_PLAIN)).toEqual([[0, 7]]);
  });

  it('ignores Greek accents and matches accent-free queries', () => {
    expect(GREEK_ACCENTED.length).toBe(8);
    expect(highlightRanges(GREEK_ACCENTED, 'καλημερα')).toEqual([[0, 8]]);
  });

  it('folds final sigma to sigma', () => {
    expect(highlightRanges(GREEK_FINAL_SIGMA, 'ΛΟΓΟΣ')).toEqual([[0, 5]]);
  });

  it('sorts ranges from multiple query tokens', () => {
    expect(highlightRanges('one two one', 'two one')).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
    ]);
  });

  it('merges overlapping ranges', () => {
    expect(highlightRanges('abcdef', 'abc bcd')).toEqual([[0, 4]]);
  });

  it('merges adjacent ranges', () => {
    expect(highlightRanges('abcd', 'ab cd')).toEqual([[0, 4]]);
  });

  it('ignores tokens shorter than 2 characters', () => {
    expect(highlightRanges('a b c hello', 'a b')).toEqual([]);
    expect(highlightRanges('a b c hello', 'a hello')).toEqual([[6, 11]]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(highlightRanges('hello world', 'xyz')).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('alternates plain and hit segments that join back to the original text', () => {
    const text = 'Hello big world';
    const segments = highlightSegments(text, 'hello world');
    expect(segments).toEqual([
      { text: 'Hello', hit: true },
      { text: ' big ', hit: false },
      { text: 'world', hit: true },
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('keeps leading and trailing plain text', () => {
    expect(highlightSegments('say hi!', 'hi')).toEqual([
      { text: 'say ', hit: false },
      { text: 'hi', hit: true },
      { text: '!', hit: false },
    ]);
  });

  it('returns one plain segment for an empty query', () => {
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });

  it('returns one plain segment when nothing matches', () => {
    expect(highlightSegments('abc', 'zzz')).toEqual([{ text: 'abc', hit: false }]);
  });
});
