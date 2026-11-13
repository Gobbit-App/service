import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_DELETE_CHUNK, MEDIA_ORPHAN_GRACE_DAYS, MEDIA_SWEEP_BATCH } from '@gobbit/shared';
import { captureLogger } from '../../test/capture-logger';
import { MemoryMediaStore } from '../media/media-store';
import type { OrphanAsset } from '../repositories/assets.repo';
import { createOrphanSweeper, refusal } from './media-sweep';
import type { AssetRow } from '@gobbit/db';

const NOW = new Date('2026-03-10T06:00:00Z');

function orphans(n: number, prefix = 'gobbit/decks/d1/editor/img'): OrphanAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    publicId: `${prefix}-${i}`,
    kind: 'image' as const,
    resourceType: 'image' as const,
  }));
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

    expect(summary).toEqual({ deleted: 2, notFound: 1, failed: 0, byKind: { image: 2 } });
    const cutoff = new Date(NOW.getTime() - MEDIA_ORPHAN_GRACE_DAYS * 86_400_000);
    expect(assets.orphans).toHaveBeenCalledWith(cutoff, MEDIA_SWEEP_BATCH);
    expect(assets.deleteByIds).toHaveBeenCalledWith(['id-0', 'id-1', 'id-2']);
    await flush();
    expect(lines.at(-1)).toMatchObject({
      msg: 'media.sweep',
      event: 'media.sweep',
      outcome: 'deleted',
      deleted: 2,
      candidates: 3,
    });
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

    expect(summary).toEqual({ deleted: 1, notFound: 0, failed: 1, byKind: { image: 1 } });
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
    expect(summary).toMatchObject({ deleted: 0, notFound: 0, failed: 0 });
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
    expect(lines.some((l) => l['msg'] === 'deck media cleanup failed')).toBe(true);
  });

  it('deletes each orphan under its own resource type and counts kinds (D388)', async () => {
    const list: OrphanAsset[] = [
      { id: 'i', publicId: 'p/img', kind: 'image', resourceType: 'image' },
      { id: 'd', publicId: 'p/doc', kind: 'pdf', resourceType: 'image' },
      { id: 'v', publicId: 'p/vid', kind: 'video', resourceType: 'video' },
      { id: 'a', publicId: 'p/aud', kind: 'audio', resourceType: 'video' },
    ];
    seed(list);
    const assets = { orphans: vi.fn().mockResolvedValue(list), deleteByIds: vi.fn() };

    const summary = await createOrphanSweeper({
      assets,
      store,
      log: captureLogger().logger,
    }).sweepOrphans({ now: NOW, jobId: 'job-1' });

    expect(store.deleteTypes).toEqual(['image', 'video']);
    expect(store.deleteCalls).toEqual([
      ['p/img', 'p/doc'],
      ['p/vid', 'p/aud'],
    ]);
    expect(summary.byKind).toEqual({ image: 1, pdf: 1, video: 1, audio: 1 });
  });
});

describe('verify pass (D390)', () => {
  const asset = (over: Partial<AssetRow>): AssetRow =>
    ({
      id: 'a1',
      deckId: 'd1',
      publicId: 'p/file',
      kind: 'pdf',
      resourceType: 'image',
      bytes: 100,
      format: 'pdf',
      ...over,
    }) as AssetRow;
  const limits = { image: 1000, pdf: 1000, audio: 1000, video: 1000 };

  function harness(rows: AssetRow[]) {
    const store = new MemoryMediaStore();
    const assets = {
      orphans: vi.fn(),
      deleteByIds: vi.fn(),
      unverified: vi.fn().mockResolvedValue(rows),
      markVerified: vi.fn(),
      markRejected: vi.fn(),
    };
    const { logger, lines, flush } = captureLogger();
    const sweeper = createOrphanSweeper({ assets, store, log: logger, maxBytes: limits });
    return { store, assets, lines, flush, sweeper };
  }
  const found = (over: Record<string, unknown> = {}) => ({
    resourceType: 'image' as const,
    bytes: 100,
    format: 'pdf',
    width: null,
    height: null,
    pages: 2,
    durationMs: null,
    ...over,
  });

  it('marks files whose provider facts hold as verified', async () => {
    const h = harness([asset({})]);
    h.store.resources.set('p/file', found());
    expect(await h.sweeper.verifyRecent({ now: NOW, jobId: 'j' })).toEqual({
      verified: 1,
      refused: 0,
      missing: 0,
      failed: 0,
    });
    expect(h.assets.markVerified).toHaveBeenCalledWith('a1', NOW);
    expect(h.store.deleteCalls).toEqual([]);
  });

  it('deletes and rejects a file over its limit and logs media.verify refused', async () => {
    const h = harness([asset({ bytes: 10 })]);
    h.store.resources.set('p/file', found({ bytes: 5000 }));
    const summary = await h.sweeper.verifyRecent({ now: NOW, jobId: 'j' });
    await h.flush();
    expect(summary.refused).toBe(1);
    expect(h.store.deleteCalls).toEqual([['p/file']]);
    expect(h.assets.markRejected).toHaveBeenCalledWith('a1', NOW);
    expect(h.lines).toContainEqual(
      expect.objectContaining({
        event: 'media.verify',
        outcome: 'refused',
        reason: 'too_large',
        jobId: 'j',
        assetId: 'a1',
        level: 'warn',
      }),
    );
  });

  it('logs a file the provider doesn’t know as missing and deletes nothing', async () => {
    const h = harness([asset({})]);
    const summary = await h.sweeper.verifyRecent({ now: NOW });
    await h.flush();
    expect(summary.missing).toBe(1);
    expect(h.store.deleteCalls).toEqual([]);
    expect(h.assets.markRejected).not.toHaveBeenCalled();
    expect(h.lines).toContainEqual(
      expect.objectContaining({ event: 'media.verify', outcome: 'missing' }),
    );
  });

  it('keeps going when one lookup throws', async () => {
    const h = harness([asset({ id: 'x' }), asset({ id: 'y', publicId: 'p/ok' })]);
    h.store.resources.set('p/ok', found());
    h.store.resource = async (id: string, type) => {
      if (id === 'p/file') throw new Error('provider down');
      return MemoryMediaStore.prototype.resource.call(h.store, id, type);
    };
    const summary = await h.sweeper.verifyRecent({ now: NOW });
    expect(summary).toMatchObject({ verified: 1, failed: 1 });
  });

  it.each([
    ['format', 'pdf', { format: 'exe' }],
    ['format', 'pdf', { format: 'mp4' }],
    ['resource_type', 'pdf', { resourceType: 'video' }],
    ['too_large', 'video', { resourceType: 'video', format: 'mp4', bytes: 1001 }],
    [null, 'audio', { resourceType: 'video', format: 'm4a', bytes: 1000 }],
  ] as const)('refusal → %s for %s', (expected, kind, over) => {
    expect(refusal(kind, { ...found(), ...over }, limits)).toBe(expected);
  });
});
