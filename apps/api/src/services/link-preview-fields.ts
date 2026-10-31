import type { AssetRow } from '@gobbit/db';
import type { LinkPayload } from '@gobbit/shared';
import { unprocessableField } from '../errors/http-errors';
import type { AssetsRepo } from '../repositories/assets.repo';

type Preview = NonNullable<LinkPayload['preview']>;

/**
 * D163: a link card's `preview.publicId`/`width`/`height` are server-owned. `stored` is the
 * saved payload (null on create).
 */
export type LinkPreviewFields = (
  deckId: string,
  incoming: LinkPayload,
  stored: LinkPayload | null,
) => Promise<LinkPayload>;

function dimensions(source: { width: number | null; height: number | null } | Preview) {
  return {
    ...(source.width ? { width: source.width } : {}),
    ...(source.height ? { height: source.height } : {}),
  };
}

/**
 * - A client `publicId` that differs from the stored one must be a recorded asset of the deck
 *   (D160, 015's "Add photo"); its dimensions come from the asset.
 * - Otherwise the stored copy wins over what the client sends, unless the URL or
 *   `preview.image` changed and the copy is a `link_snapshot` (the job copies the new image).
 *   A photo a member added is kept.
 * - `publicId: null` removes the photo (015).
 * - Client dimensions are never trusted.
 */
export function createLinkPreviewFields(assets: Pick<AssetsRepo, 'byPublicId'>): LinkPreviewFields {
  async function assetOf(publicId: string): Promise<AssetRow | null> {
    return assets.byPublicId(publicId);
  }

  return async (deckId, incoming, stored) => {
    const { publicId: clientId, width: _w, height: _h, ...preview } = incoming.preview ?? {};
    const storedPreview = stored?.preview;
    const storedId = storedPreview?.publicId;
    const withPreview = (fields: Partial<Preview>): LinkPayload => {
      const next = { ...preview, ...fields };
      return Object.keys(next).length > 0 || incoming.preview
        ? { ...incoming, preview: next }
        : { url: incoming.url };
    };

    if (clientId && clientId !== storedId) {
      const asset = await assetOf(clientId);
      if (!asset || asset.deckId !== deckId) {
        throw unprocessableField('payload.preview.publicId', 'Unknown image');
      }
      return withPreview({ publicId: clientId, ...dimensions(asset) });
    }

    // 015 "Remove photo": the member drops whatever copy the card had.
    if (clientId === null || !storedId || !storedPreview) return withPreview({});

    const changed =
      incoming.url !== stored.url ||
      (incoming.preview?.image ?? null) !== (storedPreview.image ?? null);
    if (changed && (await assetOf(storedId))?.source === 'link_snapshot') return withPreview({});

    return withPreview({ publicId: storedId, ...dimensions(storedPreview) });
  };
}
