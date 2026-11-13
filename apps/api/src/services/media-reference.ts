import { MEDIA_FILE_NAME_MAX, type ItemType, type MediaKind } from '@gobbit/shared';
import type { AssetRow } from '@gobbit/db';
import { unprocessableField } from '../errors/http-errors';
import type { AssetsRepo } from '../repositories/assets.repo';

export type MediaReferenceCheck = <P extends Record<string, unknown>>(
  deckId: string,
  type: ItemType,
  payload: P,
) => Promise<P>;

const KIND_LABEL: Record<MediaKind, string> = {
  image: 'a photo',
  pdf: 'a PDF',
  audio: 'an audio file',
  video: 'a video',
};

/**
 * D160 for every media kind (045, D390, D398): a media card may only reference recorded files of
 * its own deck that the verify pass hasn't rejected, of the kind its payload names; a gallery
 * can't hold the same photo twice. Every fact besides `publicId` and `alt` (dimensions, duration,
 * pages, file name) is replaced from the asset, so a client can never set one. Other card types
 * pass through unchanged.
 */
export function createMediaReferenceCheck(
  assets: Pick<AssetsRepo, 'byPublicId'>,
): MediaReferenceCheck {
  async function recorded(deckId: string, publicId: unknown, path: string): Promise<AssetRow> {
    const asset = typeof publicId === 'string' ? await assets.byPublicId(publicId) : null;
    if (!asset || asset.deckId !== deckId || asset.rejectedAt !== null) {
      throw unprocessableField(path, 'Unknown file');
    }
    return asset;
  }

  function sameKind(asset: AssetRow, kind: MediaKind): void {
    if (asset.kind !== kind) {
      throw unprocessableField(
        'payload.kind',
        `This file is ${KIND_LABEL[asset.kind]}, not ${KIND_LABEL[kind]}`,
      );
    }
  }

  return async (deckId, type, payload) => {
    if (type !== 'media') return payload;
    const kind = payload['kind'] as MediaKind;

    if (kind === 'image') {
      const images = (payload['images'] ?? []) as Record<string, unknown>[];
      const seen = new Set<unknown>();
      const out: Record<string, unknown>[] = [];
      for (const [i, image] of images.entries()) {
        const path = `payload.images.${i}.publicId`;
        if (seen.has(image['publicId'])) {
          throw unprocessableField(path, 'The same photo is already in this card');
        }
        seen.add(image['publicId']);
        const asset = await recorded(deckId, image['publicId'], path);
        sameKind(asset, 'image');
        const { width: _w, height: _h, ...rest } = image;
        out.push({ ...rest, ...dimensions(asset) });
      }
      return { ...payload, images: out };
    }

    const asset = await recorded(deckId, payload['publicId'], 'payload.publicId');
    sameKind(asset, kind);
    const {
      width: _w,
      height: _h,
      durationMs: _d,
      pages: _p,
      fileName: _f,
      ...rest
    } = payload as Record<string, unknown>;
    const name = fileName(asset);
    return {
      ...rest,
      ...(kind === 'audio' ? {} : dimensions(asset)),
      ...(asset.durationMs !== null && kind !== 'pdf' ? { durationMs: asset.durationMs } : {}),
      ...(asset.pages !== null && kind === 'pdf' ? { pages: asset.pages } : {}),
      ...(name ? { fileName: name } : {}),
    } as unknown as typeof payload;
  };
}

function dimensions(asset: AssetRow): { width?: number; height?: number } {
  return {
    ...(asset.width !== null ? { width: asset.width } : {}),
    ...(asset.height !== null ? { height: asset.height } : {}),
  };
}

/** The member's own name for the file (searchable, never public, D397), with its extension. */
export function fileName(asset: Pick<AssetRow, 'originalFilename' | 'format'>): string | null {
  if (!asset.originalFilename) return null;
  const ext = asset.format ? `.${asset.format}` : '';
  const base = asset.originalFilename.endsWith(ext)
    ? asset.originalFilename.slice(0, -ext.length || undefined)
    : asset.originalFilename;
  return [...`${base}${ext}`].slice(0, MEDIA_FILE_NAME_MAX).join('');
}
