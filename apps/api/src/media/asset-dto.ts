import type { MediaAsset } from '@gobbit/shared';
import type { AssetRow } from '@gobbit/db';

/** The API shape of one recorded image (D157). */
export function toMediaAsset(row: AssetRow): MediaAsset {
  return {
    publicId: row.publicId,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    format: row.format,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}
