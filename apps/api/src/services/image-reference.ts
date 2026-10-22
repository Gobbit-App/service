import type { ItemType } from '@pb/shared';
import { unprocessableField } from '../errors/http-errors';
import type { AssetsRepo } from '../repositories/assets.repo';

export type ImageReferenceCheck = <P extends Record<string, unknown>>(
  deckId: string,
  type: ItemType,
  payload: P,
) => Promise<P>;

/**
 * D160: an image card may only reference a recorded asset of its own deck, and its `width` and
 * `height` come from that asset (client values are replaced; unknown dimensions are dropped).
 * Other card types pass through unchanged.
 */
export function createImageReferenceCheck(
  assets: Pick<AssetsRepo, 'byPublicId'>,
): ImageReferenceCheck {
  return async (deckId, type, payload) => {
    if (type !== 'image') return payload;
    const publicId = payload['publicId'];
    const asset = typeof publicId === 'string' ? await assets.byPublicId(publicId) : null;
    if (!asset || asset.deckId !== deckId) {
      throw unprocessableField('payload.publicId', 'Unknown image');
    }
    const { width: _w, height: _h, ...rest } = payload;
    return {
      ...rest,
      ...(asset.width !== null ? { width: asset.width } : {}),
      ...(asset.height !== null ? { height: asset.height } : {}),
    } as unknown as typeof payload;
  };
}
