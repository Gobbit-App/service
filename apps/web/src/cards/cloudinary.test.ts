import { describe, expect, it } from 'vitest';
import { cloudinaryImageUrl, cloudinarySrcSet, IMAGE_WIDTHS } from './cloudinary';

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
