import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_DELETE_CHUNK, MEDIA_ORPHAN_GRACE_DAYS, MEDIA_SWEEP_BATCH } from '@pb/shared';
import { captureLogger } from '../../test/capture-logger';
import { MemoryMediaStore } from '../media/media-store';
import type { OrphanAsset } from '../repositories/assets.repo';
import { createOrphanSweeper } from './media-sweep';

const NOW = new Date('2026-03-10T06:00:00Z');

function orphans(n: number, prefix = 'gobbit/decks/d1/editor/img'): OrphanAsset[] {
  return Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, publicId: `${prefix}-${i}` }));
}

describe('createOrphanSweeper (D158)', () => {
  let store: MemoryMediaStore;

  beforeEach(() => {
    store = new MemoryMediaStore();
  });

  function seed(list: OrphanAsset[]) {
    for (const o of list) {
      store.images.set(o.publicId, {
        publicId: o.publicId,
        width: 1,
        height: 1,
        bytes: 1,
        format: 'jpg',
        tags: [],
      });
    }
  }

  it('deletes orphans past the grace period and removes their rows', async () => {
    const list = orphans(3);
    seed(list.slice(0, 2)); // the third is already gone from the store
    const assets = {
      orphans: vi.fn().mockResolvedValue(list),
      deleteByIds: vi.fn().mockResolvedValue(3),
    };
    const { logger, lines, flush } = captureLogger();

    const summary = await createOrphanSweeper({ assets, store, log: logger }).sweepOrphans({
      now: NOW,
    });

    expect(summary).toEqual({ deleted: 2, notFound: 1, failed: 0 });
    const cutoff = new Date(NOW.getTime() - MEDIA_ORPHAN_GRACE_DAYS * 86_400_000);
    expect(assets.orphans).toHaveBeenCalledWith(cutoff, MEDIA_SWEEP_BATCH);
    expect(assets.deleteByIds).toHaveBeenCalledWith(['id-0', 'id-1', 'id-2']);
    await flush();
    expect(lines.at(-1)).toMatchObject({ msg: 'media sweep finished', deleted: 2, candidates: 3 });
  });

  it('keeps rows whose deletion failed for the next run', async () => {
    const list = orphans(2);
    seed(list);
    store.failing.add(list[1]!.publicId);
    const assets = { orphans: vi.fn().mockResolvedValue(list), deleteByIds: vi.fn() };

    const summary = await createOrphanSweeper({
      assets,
      store,
      log: captureLogger().logger,
    }).sweepOrphans({ now: NOW });

    expect(summary).toEqual({ deleted: 1, notFound: 0, failed: 1 });
    expect(assets.deleteByIds).toHaveBeenCalledWith(['id-0']);
  });

  it('asks the store in chunks', async () => {
    const list = orphans(MEDIA_DELETE_CHUNK + 5);
    const assets = { orphans: vi.fn().mockResolvedValue(list), deleteByIds: vi.fn() };

    await createOrphanSweeper({ assets, store, log: captureLogger().logger }).sweepOrphans({
      now: NOW,
    });

    expect(store.deleteCalls.map((c) => c.length)).toEqual([MEDIA_DELETE_CHUNK, 5]);
    expect(assets.deleteByIds).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a store', async () => {
    const assets = { orphans: vi.fn(), deleteByIds: vi.fn() };
    const summary = await createOrphanSweeper({
      assets,
      store: null,
      log: captureLogger().logger,
    }).sweepOrphans({ now: NOW });
    expect(summary).toEqual({ deleted: 0, notFound: 0, failed: 0 });
    expect(assets.orphans).not.toHaveBeenCalled();
  });

  it('deleteForDeck removes every prefix of the deck and survives a failing one', async () => {
    const failingStore = new MemoryMediaStore();
    const original = failingStore.deleteByPrefix.bind(failingStore);
    let first = true;
    failingStore.deleteByPrefix = async (prefix: string) => {
      if (first) {
        first = false;
        await original(prefix);
        throw new Error('cloudinary down');
      }
      await original(prefix);
    };
    const { logger, lines, flush } = captureLogger();
    const assets = { orphans: vi.fn(), deleteByIds: vi.fn() };

    await createOrphanSweeper({ assets, store: failingStore, log: logger }).deleteForDeck('d1');

    expect(failingStore.prefixDeletes.length).toBeGreaterThan(1);
    expect(failingStore.prefixDeletes.every((p) => p.includes('d1'))).toBe(true);
    await flush();
    expect(lines.some((l) => l['msg'] === 'deck image cleanup failed')).toBe(true);
  });
});
