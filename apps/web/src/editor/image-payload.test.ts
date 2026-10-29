import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '@gobbit/shared';
import { withoutPhoto, withPhoto } from './image-payload';

const asset: MediaAsset = {
  publicId: 'gobbit/items/d/new',
  width: 1200,
  height: 800,
  bytes: 1,
  format: 'jpg',
  source: 'editor',
  createdAt: '2026-03-01T00:00:00.000Z',
};

describe('withPhoto', () => {
  it('takes the asset id and dimensions, keeping alt', () => {
    expect(withPhoto({ publicId: '', alt: 'Bread' }, asset)).toEqual({
      publicId: 'gobbit/items/d/new',
      alt: 'Bread',
      width: 1200,
      height: 800,
    });
  });

  it('drops stale dimensions when the asset has none', () => {
    const old = { publicId: 'old', alt: 'a', width: 10, height: 20 };
    expect(withPhoto(old, { ...asset, width: null, height: null })).toEqual({
      publicId: 'gobbit/items/d/new',
      alt: 'a',
    });
  });
});

describe('withoutPhoto', () => {
  it('clears the id and the dimensions, keeping alt', () => {
    expect(withoutPhoto({ publicId: 'p', alt: 'a', width: 10, height: 20 })).toEqual({
      publicId: '',
      alt: 'a',
    });
  });
});
