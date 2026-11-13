import type { MediaAsset } from '@gobbit/shared';
import type { AssetRow } from '@gobbit/db';

/** The API shape of one recorded file (D157, 045). */
export function toMediaAsset(row: AssetRow): MediaAsset {
  return {
    publicId: row.publicId,
    kind: row.kind,
    resourceType: row.resourceType,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    format: row.format,
    durationMs: row.durationMs,
    pages: row.pages,
    originalFilename: row.originalFilename,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}
