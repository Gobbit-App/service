import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { assets, items, users, type AssetRow, type DeckRow } from '@gobbit/db';
import type { ItemStatus } from '@gobbit/shared';
import { MEDIA_ORPHAN_GRACE_DAYS } from '@gobbit/shared';
import {
  createAccountUser,
  createAsset,
  createDeck,
  createItem,
  makeProfileAsset,
} from '@gobbit/db/test';
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

  it('keeps an image only a cover references whatever the card state; frees it once unreferenced (D409)', async () => {
    const cover = (a: AssetRow) => ({ publicId: a.publicId, width: 1, height: 1 });
    const setCover = (id: string, a: AssetRow | null) =>
      ctx.t.db
        .update(items)
        .set({ cover: a ? cover(a) : null })
        .where(eq(items.id, id));
    const coverCard = async (a: AssetRow, status: ItemStatus = 'published') => {
      const card = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Cover', body: 'x' },
        status,
      });
      await setCover(card.id, a);
      return card;
    };

    const live = await stored(old);
    await coverCard(live);
    const archived = await stored(old);
    await coverCard(archived, 'archived');
    const trashed = await stored(old);
    const trashedCard = await coverCard(trashed);
    await ctx.t.db.update(items).set({ deletedAt: now }).where(eq(items.id, trashedCard.id));
    const kept = [live, archived, trashed];

    expect(await sweeper.sweepOrphans({ now })).toMatchObject({ deleted: 0, failed: 0 });
    expect(await remaining(kept.map((a) => a.id))).toHaveLength(3);

    const removed = await stored(old);
    const removedCard = await coverCard(removed);
    const purged = await stored(old);
    const purgedCard = await coverCard(purged);
    await setCover(removedCard.id, null);
    await ctx.t.db.delete(items).where(eq(items.id, purgedCard.id));

    const summary = await sweeper.sweepOrphans({ now });
    expect(summary).toMatchObject({ deleted: 2, failed: 0 });
    expect(await remaining([removed.id, purged.id])).toEqual([]);
    expect(await remaining(kept.map((a) => a.id))).toHaveLength(3);
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

/** 046 (D423, FR-011): profile photos are kept while referenced and freed like any orphan afterwards. */
describe('media sweep of profile photos (046)', () => {
  const ctx = setupApiTest();
  const store = new MemoryMediaStore();
  let sweeper: ReturnType<typeof createOrphanSweeper>;

  beforeAll(() => {
    sweeper = createOrphanSweeper({
      assets: createAssetsRepo(ctx.t.db),
      store,
      log: captureLogger().logger,
    });
  });

  beforeEach(async () => {
    await ctx.t.db.delete(assets);
    store.images.clear();
    store.deleteCalls.length = 0;
    store.resources.clear();
  });

  async function photo(userId: string): Promise<AssetRow> {
    const asset = await makeProfileAsset(ctx.t.db, userId, { createdAt: old });
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

  const setAvatar = (userId: string, a: AssetRow | null) =>
    ctx.t.db
      .update(users)
      .set({ avatar: a ? { publicId: a.publicId, width: 256, height: 256 } : null })
      .where(eq(users.id, userId));

  const remaining = async (ids: string[]) =>
    (await ctx.t.db.select().from(assets).where(inArray(assets.id, ids))).map((a) => a.publicId);

  it('never sweeps a referenced avatar, however old', async () => {
    const user = await createAccountUser(ctx.t.db);
    const asset = await photo(user.id);
    await setAvatar(user.id, asset);

    expect(await sweeper.sweepOrphans({ now })).toMatchObject({ deleted: 0, failed: 0 });
    expect(await remaining([asset.id])).toEqual([asset.publicId]);
  });

  it('frees a replaced and a removed avatar after the grace period, not before', async () => {
    const user = await createAccountUser(ctx.t.db);
    const other = await createAccountUser(ctx.t.db);
    const first = await photo(user.id);
    const second = await photo(user.id);
    const removed = await photo(other.id);
    await setAvatar(user.id, first);
    await setAvatar(other.id, removed);
    await setAvatar(user.id, second);
    await setAvatar(other.id, null);

    // Inside the grace period nothing is freed.
    await ctx.t.db.update(assets).set({ createdAt: recent });
    expect(await sweeper.sweepOrphans({ now })).toMatchObject({ deleted: 0 });

    await ctx.t.db.update(assets).set({ createdAt: old });
    expect(await sweeper.sweepOrphans({ now })).toMatchObject({ deleted: 2, failed: 0 });
    expect(await remaining([first.id, second.id, removed.id])).toEqual([second.publicId]);
  });

  it('removing the user row nulls the asset owner, then the asset is swept as an orphan', async () => {
    const user = await createAccountUser(ctx.t.db);
    const asset = await photo(user.id);
    await setAvatar(user.id, asset);
    await ctx.t.pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const [row] = await ctx.t.db.select().from(assets).where(eq(assets.id, asset.id));
    expect(row!.ownerUserId).toBeNull();

    expect(await sweeper.sweepOrphans({ now })).toMatchObject({ deleted: 1, failed: 0 });
    expect(await remaining([asset.id])).toEqual([]);
    expect(store.images.has(asset.publicId)).toBe(false);
  });
});
