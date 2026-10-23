import { describe, expect, it } from 'vitest';
import {
  cloudinaryImageUrl,
  cloudinaryPlaceholderUrl,
  cloudinarySrcSet,
  IMAGE_WIDTHS,
  PLACEHOLDER_WIDTH,
} from './cloudinary';

describe('cloudinaryImageUrl', () => {
  it('builds an auto-format, width-limited delivery URL', () => {
    expect(cloudinaryImageUrl('demo', 'family/soup', 720)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_720/family/soup',
    );
  });

  it('encodes each path segment but keeps the folder separators', () => {
    expect(cloudinaryImageUrl('demo', 'a b/c?d', 360)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_360/a%20b/c%3Fd',
    );
  });
});

describe('cloudinarySrcSet', () => {
  it('lists one candidate per default width', () => {
    const candidates = cloudinarySrcSet('demo', 'x').split(', ');

    expect(candidates).toHaveLength(IMAGE_WIDTHS.length);
    expect(candidates[0]).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_360/x 360w',
    );
    expect(candidates.at(-1)).toMatch(/w_1080\/x 1080w$/);
  });

  it('honours custom widths', () => {
    expect(cloudinarySrcSet('demo', 'x', [100])).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_100/x 100w',
    );
  });
});

describe('cloudinaryPlaceholderUrl', () => {
  it('builds a tiny, lowest-quality blurred variant (D161)', () => {
    expect(cloudinaryPlaceholderUrl('demo', 'family/soup')).toBe(
      `https://res.cloudinary.com/demo/image/upload/f_auto,q_1,e_blur:2000,w_${PLACEHOLDER_WIDTH}/family/soup`,
    );
  });

  it('encodes the path like the sharp URL', () => {
    expect(cloudinaryPlaceholderUrl('demo', 'a b/c')).toMatch(/w_32\/a%20b\/c$/);
  });
});
