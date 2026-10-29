import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRow } from '@gobbit/db';
import { captureLogger } from '../../test/capture-logger';
import type { SafeImageFetchResult } from '../fetch/safe-fetch';
import { MemoryMediaStore } from '../media/media-store';
import type { NewAsset } from '../repositories/assets.repo';
import { createAssetUploader, fetchFailureReason } from './media-upload-from-url';

const deckId = 'd1';
const ok: SafeImageFetchResult = {
  status: 200,
  finalUrl: 'https://img.example.test/a.png',
  ms: 5,
  bytes: new Uint8Array([1, 2, 3]),
  contentType: 'image/png',
  error: null,
};

describe('fetchFailureReason', () => {
  it('passes the image errors through and maps the rest to http_error', () => {
    for (const e of ['blocked', 'timeout', 'not_image', 'too_large'] as const) {
      expect(fetchFailureReason(e)).toBe(e);
    }
    expect(fetchFailureReason('http_404')).toBe('http_error');
    expect(fetchFailureReason('network')).toBe('http_error');
  });
});

describe('createAssetUploader.uploadFromUrl (D159)', () => {
  let store: MemoryMediaStore;
  const upsert = vi.fn(async (v: NewAsset) => ({
    row: { ...v, id: 'a1', createdAt: new Date('2026-03-01T00:00:00Z') } as AssetRow,
    created: true,
  }));

  beforeEach(() => {
    store = new MemoryMediaStore();
    upsert.mockClear();
  });

  const uploader = (fetched: SafeImageFetchResult, s: MemoryMediaStore | null = store) =>
    createAssetUploader({
      assets: { upsert },
      store: s,
      imageFetch: vi.fn().mockResolvedValue(fetched),
      log: captureLogger().logger,
    });

  it('stores the bytes in the source folder and records the asset', async () => {
    const result = await uploader(ok).uploadFromUrl({
      deckId,
      url: ok.finalUrl!,
      source: 'link_snapshot',
    });

    expect(result.asset).toMatchObject({ source: 'link_snapshot', width: 800, height: 600 });
    const [stored] = [...store.images.values()];
    expect(stored!.publicId.startsWith(`gobbit/links/${deckId}/`)).toBe(true);
    expect(stored!.tags).toContain('link_snapshot');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ deckId, source: 'link_snapshot', uploadedBy: null, format: 'png' }),
    );
  });

  it('returns the fetch refusal as the reason without uploading', async () => {
    const result = await uploader({
      ...ok,
      bytes: null,
      contentType: null,
      error: 'blocked',
    }).uploadFromUrl({ deckId, url: 'http://10.0.0.1/x.png', source: 'remote' });

    expect(result).toEqual({ asset: null, reason: 'blocked' });
    expect(store.images.size).toBe(0);
  });

  it('answers unavailable without a store', async () => {
    const result = await uploader(ok, null).uploadFromUrl({ deckId, url: 'x', source: 'remote' });
    expect(result).toEqual({ asset: null, reason: 'unavailable' });
  });

  it('never throws: a store failure becomes upload_failed', async () => {
    store.uploadError = new Error('cloudinary 500');
    const result = await uploader(ok).uploadFromUrl({ deckId, url: 'x', source: 'remote' });
    expect(result).toEqual({ asset: null, reason: 'upload_failed' });
  });

  it('treats an id recorded for another deck as upload_failed', async () => {
    upsert.mockResolvedValueOnce(null as never);
    const result = await uploader(ok).uploadFromUrl({ deckId, url: 'x', source: 'remote' });
    expect(result).toEqual({ asset: null, reason: 'upload_failed' });
  });
});
