import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { assets, items, type AssetRow, type DeckRow } from '@gobbit/db';
import type { ItemStatus } from '@gobbit/shared';
import { MEDIA_ORPHAN_GRACE_DAYS } from '@gobbit/shared';
import { createAsset, createDeck, createItem } from '@gobbit/db/test';
import { MemoryMediaStore } from '../src/media/media-store';
import { createAssetsRepo } from '../src/repositories/assets.repo';
import { createOrphanSweeper } from '../src/services/media-sweep';
import { captureLogger } from './capture-logger';
import { setupApiTest } from './helpers';

const DAY_MS = 86_400_000;
const now = new Date();
const old = new Date(now.getTime() - (MEDIA_ORPHAN_GRACE_DAYS + 1) * DAY_MS);
const recent = new Date(now.getTime() - (MEDIA_ORPHAN_GRACE_DAYS - 1) * DAY_MS);

describe('media sweep against the database (D158)', () => {
  const ctx = setupApiTest();
  const store = new MemoryMediaStore();
  let deck: DeckRow;
  let sweeper: ReturnType<typeof createOrphanSweeper>;

  beforeAll(() => {
    sweeper = createOrphanSweeper({
      assets: createAssetsRepo(ctx.t.db),
      store,
      log: captureLogger().logger,
    });
  });

  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    // Earlier tests' leftovers would join the batch; each test starts from a clean registry.
    await ctx.t.db.delete(assets);
    store.images.clear();
    store.deleteCalls.length = 0;
    store.resources.clear();
  });

  /** An asset that also exists in the store, `createdAt` as given. */
  async function stored(createdAt: Date): Promise<AssetRow> {
    const asset = await createAsset(ctx.t.db, deck, { createdAt });
    store.images.set(asset.publicId, {
      publicId: asset.publicId,
      width: 1,
      height: 1,
      bytes: 1,
      format: 'jpg',
      tags: [],
    });
    return asset;
  }

  async function imageCard(asset: AssetRow, status: ItemStatus = 'published') {
    return createItem(ctx.t.db, deck, {
      card: {
        type: 'media',
        title: 'Photo',
        payload: { kind: 'image', images: [{ publicId: asset.publicId, alt: 'x' }] },
      },
      status,
    });
  }

  const remaining = async (ids: string[]) =>
    (await ctx.t.db.select().from(assets).where(inArray(assets.id, ids))).map((a) => a.publicId);

  const linkPayload = (asset: AssetRow) => ({
    url: 'https://bakery.example/',
    preview: { title: 'Bakery', image: 'https://bakery.example/og.jpg', publicId: asset.publicId },
  });

  it("keeps a link card's stored preview and deletes one it no longer points at (D163)", async () => {
    const kept = await stored(old);
    await createItem(ctx.t.db, deck, {
      card: { type: 'link', title: 'Bakery', payload: linkPayload(kept) },
    });
    const replaced = await stored(old);
    const card = await createItem(ctx.t.db, deck, {
      card: { type: 'link', title: 'Bakery', payload: linkPayload(replaced) },
    });
    const replacement = await stored(old);
    await ctx.t.db
      .update(items)
      .set({ payload: linkPayload(replacement) })
      .where(eq(items.id, card.id));

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 1, notFound: 0, failed: 0 });
    expect((await remaining([kept.id, replaced.id, replacement.id])).sort()).toEqual(
      [kept.publicId, replacement.publicId].sort(),
    );
    expect(store.images.has(replaced.publicId)).toBe(false);
    expect(store.images.has(kept.publicId)).toBe(true);
  });

  it('keeps every referenced asset whatever the card status, including deleted in window', async () => {
    const kept: AssetRow[] = [];
    for (const status of ['proposed', 'published', 'archived'] as const) {
      const asset = await stored(old);
      await imageCard(asset, status);
      kept.push(asset);
    }
    const trashed = await stored(old);
    const card = await imageCard(trashed);
    await ctx.t.db.update(items).set({ deletedAt: now }).where(eq(items.id, card.id));
    kept.push(trashed);

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 0, notFound: 0, failed: 0 });
    expect(await remaining(kept.map((a) => a.id))).toHaveLength(kept.length);
    expect(store.deleteCalls).toEqual([]);
  });

  it('deletes never-saved and purged assets past the grace period; keeps young ones', async () => {
    const neverSaved = await stored(old);
    const purged = await stored(old);
    const card = await imageCard(purged);
    await ctx.t.db.delete(items).where(eq(items.id, card.id));
    const young = await stored(recent);
    const missing = await createAsset(ctx.t.db, deck, { createdAt: old });

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 2, notFound: 1, failed: 0 });
    expect(await remaining([neverSaved.id, purged.id, missing.id, young.id])).toEqual([
      young.publicId,
    ]);
    expect(store.images.has(neverSaved.publicId)).toBe(false);
    expect(store.images.has(young.publicId)).toBe(true);
  });

  it('keeps the row of an image whose deletion failed, for the next run', async () => {
    const asset = await stored(old);
    store.failing.add(asset.publicId);
    try {
      expect(await sweeper.sweepOrphans({ now })).toMatchObject({
        deleted: 0,
        notFound: 0,
        failed: 1,
      });
      expect(await remaining([asset.id])).toEqual([asset.publicId]);
    } finally {
      store.failing.delete(asset.publicId);
    }
  });

  it('never sweeps a photo in any gallery position (D398)', async () => {
    const photos = [await stored(old), await stored(old), await stored(old)];
    await createItem(ctx.t.db, deck, {
      card: {
        type: 'media',
        title: 'School play',
        payload: { kind: 'image', images: photos.map((p) => ({ publicId: p.publicId })) },
      },
    });
    const orphan = await stored(old);

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 1, byKind: { image: 1 } });
    expect(await remaining(photos.map((p) => p.id))).toHaveLength(3);
    expect(await remaining([orphan.id])).toEqual([]);
  });

  it('keeps a referenced PDF, audio and video file and deletes orphans as video resources (D388)', async () => {
    const kept = await createAsset(ctx.t.db, deck, { kind: 'pdf', createdAt: old });
    await createItem(ctx.t.db, deck, {
      card: { type: 'media', title: 'Doc', payload: { kind: 'pdf', publicId: kept.publicId } },
    });
    const clip = await createAsset(ctx.t.db, deck, { kind: 'video', createdAt: old });
    store.resources.set(clip.publicId, {
      resourceType: 'video',
      bytes: 1,
      format: 'mp4',
      width: 1,
      height: 1,
      pages: null,
      durationMs: 1,
    });
    store.deleteTypes.length = 0;

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 1, byKind: { video: 1 } });
    expect(store.deleteTypes).toEqual(['video']);
    expect(await remaining([kept.id, clip.id])).toEqual([kept.publicId]);
  });
});

describe('verify pass against the database (D390)', () => {
  const ctx = setupApiTest();
  const store = new MemoryMediaStore();
  let deck: DeckRow;

  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await ctx.t.db.delete(assets);
  });

  it('rejects a file whose provider size breaks the limit; cards then refuse it', async () => {
    const asset = await createAsset(ctx.t.db, deck, { kind: 'pdf', bytes: 100 });
    store.resources.set(asset.publicId, {
      resourceType: 'image',
      bytes: 50_000_000,
      format: 'pdf',
      width: 1,
      height: 1,
      pages: 2,
      durationMs: null,
    });
    const sweeper = createOrphanSweeper({
      assets: createAssetsRepo(ctx.t.db),
      store,
      log: captureLogger().logger,
      maxBytes: { image: 1, pdf: 10_000_000, audio: 1, video: 1 },
    });

    expect(await sweeper.verifyRecent({ now, jobId: 'job-1' })).toMatchObject({ refused: 1 });
    const [row] = await ctx.t.db.select().from(assets).where(eq(assets.id, asset.id));
    expect(row!.rejectedAt).not.toBeNull();
    expect(store.resources.has(asset.publicId)).toBe(false);
    // Checked once: the next run has nothing left to verify.
    expect(await sweeper.verifyRecent({ now })).toMatchObject({ verified: 0, refused: 0 });

    const res = await ctx.app.request(`/decks/${deck.id}/items`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'media',
        title: 'Doc',
        payload: { kind: 'pdf', publicId: asset.publicId },
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe('deck delete drops its stored images (D158)', () => {
  const store = new MemoryMediaStore();
  const ctx = setupApiTest({ media: { mediaStore: store } });

  it('deletes the three deck prefixes after the soft delete', async () => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner);
    const res = await ctx.app.request(`/decks/${deck.id}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(res.status).toBe(204);
    expect(store.prefixDeletes).toEqual([
      `gobbit/items/${deck.id}/`,
      `gobbit/ingest/${deck.id}/`,
      `gobbit/links/${deck.id}/`,
    ]);
  });
});
