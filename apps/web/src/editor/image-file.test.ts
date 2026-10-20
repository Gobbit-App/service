import { describe, expect, it } from 'vitest';
import { checkImageFile, IMAGE_ACCEPT } from './image-file';

const MB = 1024 * 1024;

describe('checkImageFile', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['IMG_0001.HEIC', 'image/heic'],
    ['IMG_0001.HEIC', ''],
    ['IMG_0002.heif', ''],
  ])('accepts %s (%s)', (name, type) => {
    expect(checkImageFile({ name, type, size: MB })).toBeNull();
  });

  it.each([
    ['doc.pdf', 'application/pdf'],
    ['anim.gif', 'image/gif'],
    ['noext', ''],
    ['notes.txt', ''],
  ])('refuses %s (%s)', (name, type) => {
    expect(checkImageFile({ name, type, size: MB })).toMatch(/JPEG, PNG, WebP or HEIC/);
  });

  it('refuses a file over the limit and names the limit', () => {
    expect(checkImageFile({ name: 'big.jpg', type: 'image/jpeg', size: 8 * MB + 1 })).toBe(
      'The photo must be at most 8 MB.',
    );
    expect(checkImageFile({ name: 'ok.jpg', type: 'image/jpeg', size: 8 * MB })).toBeNull();
  });

  it('accept lists types and extensions', () => {
    expect(IMAGE_ACCEPT).toContain('image/heic');
    expect(IMAGE_ACCEPT).toContain('.heic');
  });
});
