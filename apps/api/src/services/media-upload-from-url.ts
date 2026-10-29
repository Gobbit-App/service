import type { AssetSource, MediaAsset } from '@gobbit/shared';
import type { SafeImageFetch } from '../fetch/safe-fetch';
import type { Logger } from '../lib/logger';
import { toMediaAsset } from '../media/asset-dto';
import { serverUploadFolder, type MediaStore } from '../media/media-store';
import { deckTag } from '../media/sign-upload';
import type { AssetsRepo } from '../repositories/assets.repo';

export type UploadFromUrlReason =
  | 'unavailable'
  | 'blocked'
  | 'timeout'
  | 'not_image'
  | 'too_large'
  | 'http_error'
  | 'upload_failed';

export type UploadFromUrlResult =
  { asset: MediaAsset } | { asset: null; reason: UploadFromUrlReason };

/** Server-side sources; the editor records its uploads through `confirmUpload`. */
export type ServerAssetSource = Exclude<AssetSource, 'editor'>;

/** Maps a `safe-fetch` error code to the reason callers see (contract: service only). */
export function fetchFailureReason(error: string): UploadFromUrlReason {
  if (error === 'blocked' || error === 'timeout' || error === 'not_image') return error;
  if (error === 'too_large') return error;
  return 'http_error';
}

/** D159: fetch through the guard, upload the bytes, record the asset. */
export function createAssetUploader(deps: {
  assets: Pick<AssetsRepo, 'upsert'>;
  store: MediaStore | null;
  imageFetch: SafeImageFetch;
  log: Logger;
}) {
  const { assets, store, imageFetch, log } = deps;

  return {
    async uploadFromUrl(input: {
      deckId: string;
      url: string;
      source: ServerAssetSource;
      uploadedBy?: string | null;
    }): Promise<UploadFromUrlResult> {
      if (!store) return { asset: null, reason: 'unavailable' };
      const fetched = await imageFetch(input.url);
      if (!fetched.bytes || !fetched.contentType) {
        const reason = fetchFailureReason(fetched.error ?? 'fetch_failed');
        log.info(
          { deckId: input.deckId, source: input.source, reason, error: fetched.error },
          'image fetch refused',
        );
        return { asset: null, reason };
      }

      try {
        const stored = await store.uploadBuffer({
          bytes: fetched.bytes,
          mime: fetched.contentType,
          folder: serverUploadFolder(input.source, input.deckId),
          tags: [input.source, deckTag(input.deckId)],
        });
        const recorded = await assets.upsert({
          deckId: input.deckId,
          publicId: stored.publicId,
          source: input.source,
          width: stored.width,
          height: stored.height,
          bytes: stored.bytes,
          format: stored.format,
          uploadedBy: input.uploadedBy ?? null,
        });
        if (!recorded) throw new Error(`public id ${stored.publicId} is recorded for another deck`);
        return { asset: toMediaAsset(recorded.row) };
      } catch (err) {
        log.warn(
          { deckId: input.deckId, source: input.source, err: (err as Error).message },
          'server-side image upload failed',
        );
        return { asset: null, reason: 'upload_failed' };
      }
    },
  };
}
