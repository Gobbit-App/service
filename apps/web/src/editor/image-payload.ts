import type { MediaAsset } from '@pb/shared';
import type { ImagePayload } from '../cards/payload-guards';

/** The draft payload once `asset` is confirmed: its id and, when known, its dimensions (D161). */
export function withPhoto(payload: ImagePayload, asset: MediaAsset): ImagePayload {
  const { width: _w, height: _h, ...rest } = payload;
  const next: ImagePayload = { ...rest, publicId: asset.publicId };
  if (asset.width !== null && asset.height !== null) {
    next.width = asset.width;
    next.height = asset.height;
  }
  return next;
}

/** The draft payload without a photo; the old dimensions go with it. */
export function withoutPhoto(payload: ImagePayload): ImagePayload {
  const { width: _w, height: _h, ...rest } = payload;
  return { ...rest, publicId: '' };
}
