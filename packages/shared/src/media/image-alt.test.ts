import { describe, expect, it } from 'vitest';
import { imageAlt } from './image-alt';

describe('imageAlt (D206)', () => {
  it.each([
    [{ alt: 'A loaf', title: 'Bread', titleAdjacent: true }, 'A loaf'],
    [{ alt: '  A loaf ', title: 'Bread', titleAdjacent: false }, 'A loaf'],
    [{ alt: undefined, title: 'Bread', titleAdjacent: true }, ''],
    [{ alt: '', title: 'Bread', titleAdjacent: true }, ''],
    [{ alt: '   ', title: 'Bread', titleAdjacent: true }, ''],
    [{ alt: null, title: ' Bread ', titleAdjacent: false }, 'Bread'],
    [{ alt: '  ', title: 'Bread', titleAdjacent: false }, 'Bread'],
  ])('%o → %j', (input, expected) => {
    expect(imageAlt(input)).toBe(expected);
  });
});
