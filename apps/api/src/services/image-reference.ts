import type { ItemType } from '@gobbit/shared';
import type { CardCover } from '@gobbit/shared/card-cover';
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

export type CoverReferenceFailure = 'unknown_image' | 'other_deck';

export type CoverReferenceResult =
  { ok: true; cover: CardCover } | { ok: false; reason: CoverReferenceFailure };

export type CoverReference = (deckId: string, publicId: string) => Promise<CoverReferenceResult>;

/**
 * D388: a card cover may only reference a recorded asset of its own deck; `width`/`height` come
 * from that asset (dimensions it lacks are omitted).
 *
 * Returns a result union rather than throwing: the caller (items.service) maps both failures to
 * the same 422 `cover.publicId` "Unknown image" (no cross-deck probing), but needs the distinct
 * `reason` for its decision log.
 */
export function createCoverReference(assets: Pick<AssetsRepo, 'byPublicId'>): CoverReference {
  return async (deckId, publicId) => {
    const asset = await assets.byPublicId(publicId);
    if (!asset) return { ok: false, reason: 'unknown_image' };
    if (asset.deckId !== deckId) return { ok: false, reason: 'other_deck' };
    return {
      ok: true,
      cover: {
        publicId: asset.publicId,
        ...(asset.width !== null ? { width: asset.width } : {}),
        ...(asset.height !== null ? { height: asset.height } : {}),
      },
    };
  };
}
