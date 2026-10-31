import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assets, type DeckRow, type UserRow } from '@gobbit/db';
import { MEDIA_CONFIRM_RATE_PER_HOUR, MEDIA_IMAGE_MAX_BYTES } from '@gobbit/shared';
import { addMember, createAccountUser, createAsset, createDeck } from '@gobbit/db/test';
import { createSafeImageFetch } from '../src/fetch/safe-fetch';
import { isBlockedAddress } from '../src/fetch/ip-guard';
import { MemoryMediaStore } from '../src/media/media-store';
import { createAssetsRepo } from '../src/repositories/assets.repo';
import { createAssetUploader } from '../src/services/media-upload-from-url';
import { captureLogger } from './capture-logger';
import { json, setupApiTest, type ApiTestContext } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const confirm = (
  ctx: ApiTestContext,
  deck: string,
  body: unknown,
  headers: Record<string, string> = ctx.as(),
) =>
  ctx.app.request(`/decks/${deck}/media/assets`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

/** Cloudinary's upload answer for `publicId`, signed like the real service would (D157). */
function answer(store: MemoryMediaStore, publicId: string, version = 1_700_000_000) {
  return {
    publicId,
    version,
    signature: store.sign(publicId, version),
    width: 1200,
    height: 800,
    bytes: 54_321,
    format: 'jpg',
  };
}

async function member(ctx: ApiTestContext, deck: DeckRow, role: 'reader' | 'editor') {
  const user: UserRow = await createAccountUser(ctx.t.db);
  await addMember(ctx.t.db, deck, user, role);
  await ctx.sessionFor(user);
  return user;
}

describe('POST /decks/{id}/media/assets (D157)', () => {
  const store = new MemoryMediaStore();
  const ctx = setupApiTest({ media: { mediaStore: store } });
  let deck: DeckRow;
  let other: DeckRow;
  let n = 0;
  const id = (d: DeckRow = deck) => `gobbit/items/${d.id}/photo-${(n += 1)}`;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    other = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('records the upload (201, no-store), then answers a repeat with 200', async () => {
    const body = answer(store, id());
    const res = await confirm(ctx, deck.slug, body);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toMatchObject({
      publicId: body.publicId,
      width: 1200,
      height: 800,
      bytes: 54_321,
      format: 'jpg',
      source: 'editor',
    });
    const [row] = await ctx.t.db.select().from(assets).where(eq(assets.publicId, body.publicId));
    expect(row).toMatchObject({ deckId: deck.id, uploadedBy: ctx.world.owner.id });

    const again = await confirm(ctx, deck.id, body);
    expect(again.status).toBe(200);
    expect((await json(again)).publicId).toBe(body.publicId);
  });

  it('refuses a signature that does not verify (422 on signature)', async () => {
    const res = await confirm(ctx, deck.id, { ...answer(store, id()), signature: 'f'.repeat(40) });
    expect(res.status).toBe(422);
    const problem = await json(res);
    expect(problem.type).toBe('/problems/validation');
    expect(problem.errors).toEqual([expect.objectContaining({ path: 'signature' })]);
  });

  it("refuses an image outside this deck's folder, even with a valid signature", async () => {
    const res = await confirm(ctx, deck.id, answer(store, id(other)));
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toEqual([expect.objectContaining({ path: 'publicId' })]);
  });

  it('refuses an id already recorded for another deck', async () => {
    const publicId = id();
    await createAsset(ctx.t.db, other, { publicId });
    const res = await confirm(ctx, deck.id, answer(store, publicId));
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toEqual([
      expect.objectContaining({ path: 'publicId', message: 'Image belongs to another deck' }),
    ]);
  });

  it('refuses readers (403) and hides invisible decks (404)', async () => {
    const reader = await member(ctx, deck, 'reader');
    expect((await confirm(ctx, deck.id, answer(store, id()), ctx.as(reader.email))).status).toBe(
      403,
    );
    const stranger = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(stranger);
    expect((await confirm(ctx, deck.id, answer(store, id()), ctx.as(stranger.email))).status).toBe(
      404,
    );
    expect((await confirm(ctx, deck.id, answer(store, id()), ctx.anon())).status).toBe(401);
  });

  it(`limits each user to ${MEDIA_CONFIRM_RATE_PER_HOUR} confirmations per hour`, async () => {
    const editor = await member(ctx, deck, 'editor');
    const body = answer(store, id());
    for (let i = 0; i < MEDIA_CONFIRM_RATE_PER_HOUR; i++) {
      expect((await confirm(ctx, deck.id, body, ctx.as(editor.email))).status).toBeLessThan(300);
    }
    const res = await confirm(ctx, deck.id, body, ctx.as(editor.email));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rejects a body without dimensions (400)', async () => {
    const { width: _w, ...rest } = answer(store, id());
    expect((await confirm(ctx, deck.id, rest)).status).toBe(400);
  });
});

describe('POST /decks/{id}/media/assets without image storage', () => {
  const ctx = setupApiTest();

  it('answers 503 /problems/unavailable', async () => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner);
    const store = new MemoryMediaStore();
    const res = await confirm(ctx, deck.id, answer(store, `gobbit/items/${deck.id}/p`));
    expect(res.status).toBe(503);
    expect((await json(res)).type).toBe('/problems/unavailable');
  });
});

/** Local image site for D159; `/big` streams past the image cap. */
function imageServer() {
  const server: Server = createServer((req, res) => {
    if (req.url === '/photo.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    } else if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>hi</body></html>');
    } else if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.concat([PNG, Buffer.alloc(MEDIA_IMAGE_MAX_BYTES + 1)]));
    } else {
      res.writeHead(404).end();
    }
  });
  return {
    start: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    url: (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
  };
}

describe('media.uploadFromUrl against a local server (D159)', () => {
  const ctx = setupApiTest();
  const site = imageServer();
  const store = new MemoryMediaStore();
  let deck: DeckRow;
  let uploader: ReturnType<typeof createAssetUploader>;

  beforeAll(async () => {
    await site.start();
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    uploader = createAssetUploader({
      assets: createAssetsRepo(ctx.t.db),
      store,
      // Test wiring: allow the loopback fixture server (any port); everything else stays guarded.
      imageFetch: createSafeImageFetch({
        allowedPorts: null,
        isBlocked: (ip) => ip !== '127.0.0.1' && isBlockedAddress(ip),
      }),
      log: captureLogger().logger,
    });
  });
  afterAll(site.stop);
  beforeEach(() => store.images.clear());

  it('stores the image in the source folder and records the asset', async () => {
    const result = await uploader.uploadFromUrl({
      deckId: deck.id,
      url: site.url('/photo.png'),
      source: 'remote',
      uploadedBy: ctx.world.owner.id,
    });
    expect(result.asset).toMatchObject({ source: 'remote', width: 800, height: 600 });
    const [row] = await ctx.t.db
      .select()
      .from(assets)
      .where(eq(assets.publicId, result.asset!.publicId));
    expect(row).toMatchObject({ deckId: deck.id, source: 'remote', format: 'png' });
    expect(row!.publicId.startsWith(`gobbit/items/${deck.id}/`)).toBe(true);
  });

  it('refuses a page, an oversize image and a private address without storing', async () => {
    const page = await uploader.uploadFromUrl({
      deckId: deck.id,
      url: site.url('/page'),
      source: 'link_snapshot',
    });
    expect(page).toEqual({ asset: null, reason: 'not_image' });
    const big = await uploader.uploadFromUrl({
      deckId: deck.id,
      url: site.url('/big'),
      source: 'remote',
    });
    expect(big).toEqual({ asset: null, reason: 'too_large' });
    const privateIp = await uploader.uploadFromUrl({
      deckId: deck.id,
      url: 'http://10.0.0.1/x.png',
      source: 'remote',
    });
    expect(privateIp).toEqual({ asset: null, reason: 'blocked' });
    expect(store.images.size).toBe(0);
  });
});
