import { MEDIA_GALLERY_MAX } from '@gobbit/shared/media-constants';
import type { MediaAsset } from '@gobbit/shared';
import type {
  ImagePayload,
  MediaFilePayload,
  MediaImagesPayload,
  MediaPayload,
} from '../cards/payload-guards';

/** A media draft with nothing in it yet (the composer's start, and after removing a file). */
export function emptyMedia(): MediaImagesPayload {
  return { kind: 'image', images: [{ publicId: '', alt: '' }] };
}

/** D398: the photos that finished uploading, in display order (blank start slots dropped). */
export function uploadedPhotos(payload: MediaPayload): ImagePayload[] {
  return payload.kind === 'image' ? payload.images.filter((img) => img.publicId !== '') : [];
}

/** A confirmed photo as a gallery entry; dimensions come from the asset (D161). */
export function photoOf(asset: MediaAsset, alt = ''): ImagePayload {
  const photo: ImagePayload = { publicId: asset.publicId, alt };
  if (asset.width !== null && asset.height !== null) {
    photo.width = asset.width;
    photo.height = asset.height;
  }
  return photo;
}

/** Adds confirmed photos after the ones already there, up to the cap; repeats are skipped. */
export function withPhotos(payload: MediaPayload, added: ImagePayload[]): MediaImagesPayload {
  const images = uploadedPhotos(payload);
  for (const photo of added) {
    if (images.length >= MEDIA_GALLERY_MAX) break;
    if (!images.some((img) => img.publicId === photo.publicId)) images.push(photo);
  }
  return { kind: 'image', images: images.length > 0 ? images : emptyMedia().images };
}

/** The gallery with photo `index` moved by `step` (−1 earlier, +1 later); out of range = unchanged. */
export function movePhoto(payload: MediaImagesPayload, index: number, step: -1 | 1) {
  const images = uploadedPhotos(payload);
  const to = index + step;
  if (index < 0 || index >= images.length || to < 0 || to >= images.length) return payload;
  const [moved] = images.splice(index, 1);
  images.splice(to, 0, moved!);
  return { kind: 'image', images } satisfies MediaImagesPayload;
}

/** The gallery without photo `index`; removing the last photo leaves an empty media draft. */
export function withoutPhotoAt(payload: MediaImagesPayload, index: number): MediaImagesPayload {
  const images = uploadedPhotos(payload).filter((_, i) => i !== index);
  return images.length > 0 ? { kind: 'image', images } : emptyMedia();
}

/** The gallery with photo `index` described as `alt`. */
export function describePhoto(
  payload: MediaImagesPayload,
  index: number,
  alt: string,
): MediaImagesPayload {
  return {
    kind: 'image',
    images: payload.images.map((img, i) => (i === index ? { ...img, alt } : img)),
  };
}

/**
 * A confirmed PDF, audio or video file as the card's payload, keeping the description already
 * typed. The facts (pages, duration, size, name) are for the editor's preview; the server
 * replaces them from the asset when the card is saved (FR-005).
 */
export function fileOf(asset: MediaAsset, alt = ''): MediaFilePayload | null {
  if (asset.kind === 'image') return null;
  const file: MediaFilePayload = { kind: asset.kind, publicId: asset.publicId, alt };
  if (asset.width !== null && asset.height !== null) {
    file.width = asset.width;
    file.height = asset.height;
  }
  if (asset.durationMs !== null && asset.kind !== 'pdf') file.durationMs = asset.durationMs;
  if (asset.pages !== null && asset.kind === 'pdf') file.pages = asset.pages;
  if (asset.originalFilename) file.fileName = asset.originalFilename;
  return file;
}
