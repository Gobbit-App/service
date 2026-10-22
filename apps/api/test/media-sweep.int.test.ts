import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { assets, items, type AssetRow, type DeckRow } from '@pb/db';
import type { ItemStatus } from '@pb/shared';
import { MEDIA_ORPHAN_GRACE_DAYS } from '@pb/shared';
import { createAsset, createDeck, createItem } from '@pb/db/test';
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
      card: { type: 'image', title: 'Photo', payload: { publicId: asset.publicId, alt: 'x' } },
      status,
    });
  }

  const remaining = async (ids: string[]) =>
    (await ctx.t.db.select().from(assets).where(inArray(assets.id, ids))).map((a) => a.publicId);

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
    expect(summary).toEqual({ deleted: 0, notFound: 0, failed: 0 });
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
    expect(summary).toEqual({ deleted: 2, notFound: 1, failed: 0 });
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
      expect(await sweeper.sweepOrphans({ now })).toEqual({ deleted: 0, notFound: 0, failed: 1 });
      expect(await remaining([asset.id])).toEqual([asset.publicId]);
    } finally {
      store.failing.delete(asset.publicId);
    }
  });

  it('the 0012 backfill records every referenced image once, so the sweep keeps it', async () => {
    const migration = readFileSync(
      new URL('../../../packages/db/migrations/0012_media_assets.sql', import.meta.url),
      'utf8',
    );
    const backfill = /INSERT INTO "assets"[\s\S]*?DO NOTHING;/.exec(migration)?.[0];
    expect(backfill).toBeDefined();

    const legacy = { publicId: `gobbit/ingest/${deck.id}/legacy`, alt: 'x' };
    await createItem(ctx.t.db, deck, { card: { type: 'image', title: 'A', payload: legacy } });
    await createItem(ctx.t.db, deck, {
      card: { type: 'image', title: 'B', payload: legacy },
      status: 'archived',
    });
    await ctx.t.db.execute(sql.raw(backfill!));

    const rows = await ctx.t.db.select().from(assets).where(eq(assets.publicId, legacy.publicId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deckId: deck.id, source: 'ingest', width: null });

    // Backdate it past the grace period: still referenced, so never swept.
    await ctx.t.db.update(assets).set({ createdAt: old }).where(eq(assets.id, rows[0]!.id));
    expect(await sweeper.sweepOrphans({ now })).toEqual({ deleted: 0, notFound: 0, failed: 0 });
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
