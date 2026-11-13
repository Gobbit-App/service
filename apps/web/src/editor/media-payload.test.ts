import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '@gobbit/shared';
import type { MediaImagesPayload } from '../cards/payload-guards';
import {
  describePhoto,
  emptyMedia,
  fileOf,
  movePhoto,
  photoOf,
  withoutPhotoAt,
  withPhotos,
} from './media-payload';

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  publicId: 'p',
  kind: 'image',
  resourceType: 'image',
  width: 10,
  height: 20,
  bytes: 1,
  format: 'jpg',
  durationMs: null,
  pages: null,
  originalFilename: null,
  source: 'editor',
  createdAt: '2026-03-01T00:00:00.000Z',
  ...over,
});
const gallery = (...ids: string[]): MediaImagesPayload => ({
  kind: 'image',
  images: ids.map((publicId) => ({ publicId, alt: '' })),
});
const ids = (p: MediaImagesPayload) => p.images.map((i) => i.publicId);

describe('media-payload (D398)', () => {
  it('adds photos after the existing ones, skipping repeats and stopping at 8', () => {
    expect(withPhotos(emptyMedia(), [photoOf(asset())])).toEqual({
      kind: 'image',
      images: [{ publicId: 'p', alt: '', width: 10, height: 20 }],
    });
    expect(ids(withPhotos(gallery('a'), [{ publicId: 'a' }, { publicId: 'b' }]))).toEqual([
      'a',
      'b',
    ]);
    const seven = gallery('1', '2', '3', '4', '5', '6', '7');
    expect(withPhotos(seven, [{ publicId: 'x' }, { publicId: 'y' }]).images).toHaveLength(8);
  });

  it('moves, describes and removes by position', () => {
    expect(ids(movePhoto(gallery('a', 'b', 'c'), 0, 1))).toEqual(['b', 'a', 'c']);
    expect(movePhoto(gallery('a', 'b'), 0, -1)).toEqual(gallery('a', 'b'));
    expect(describePhoto(gallery('a', 'b'), 1, 'B').images[1]).toEqual({
      publicId: 'b',
      alt: 'B',
    });
    expect(withoutPhotoAt(gallery('a', 'b'), 0)).toEqual(gallery('b'));
    expect(withoutPhotoAt(gallery('a'), 0)).toEqual(emptyMedia());
  });

  it('a file asset becomes a file payload with the facts for its kind', () => {
    expect(fileOf(asset())).toBeNull();
    expect(
      fileOf(asset({ kind: 'pdf', pages: 4, durationMs: 9, originalFilename: 'a.pdf' }), 'Notes'),
    ).toEqual({
      kind: 'pdf',
      publicId: 'p',
      alt: 'Notes',
      width: 10,
      height: 20,
      pages: 4,
      fileName: 'a.pdf',
    });
    expect(
      fileOf(asset({ kind: 'audio', width: null, height: null, durationMs: 1000, pages: 2 })),
    ).toEqual({ kind: 'audio', publicId: 'p', alt: '', durationMs: 1000 });
  });
});
