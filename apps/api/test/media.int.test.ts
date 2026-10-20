import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, UserRow } from '@pb/db';
import { MEDIA_SIGN_RATE_PER_HOUR } from '@pb/shared';
import { addMember, createAccountUser, createDeck } from '@pb/db/test';
import { json, setupApiTest, type ApiTestContext } from './helpers';

// Fake credentials (split so secret scanners don't flag them): signatures are checked locally.
const API_SECRET = ['not-a-real', 'secret'].join('-');
const CLOUDINARY_URL = ['cloudinary://', 'key123', ':', API_SECRET, '@', 'test-cloud'].join('');

const sign = (ctx: ApiTestContext, deck: string, headers: Record<string, string> = ctx.as()) =>
  ctx.app.request(`/decks/${deck}/media/sign`, { method: 'POST', headers });

async function member(ctx: ApiTestContext, deck: DeckRow, role: 'reader' | 'editor' | 'owner') {
  const user: UserRow = await createAccountUser(ctx.t.db);
  await addMember(ctx.t.db, deck, user, role);
  await ctx.sessionFor(user);
  return user;
}

describe('POST /decks/{id}/media/sign (D133)', () => {
  const ctx = setupApiTest({ env: { CLOUDINARY_URL } });
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('signs an upload for the owner, scoped to the deck, with no-store', async () => {
    const res = await sign(ctx, deck.slug);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await json(res);
    expect(body).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      apiKey: 'key123',
      folder: `gobbit/items/${deck.id}`,
      tags: `editor,deck:${deck.id}`,
      allowedFormats: 'jpg,png,webp,heic,heif',
    });
    const toSign = `allowed_formats=${body.allowedFormats}&folder=${body.folder}&tags=${body.tags}&timestamp=${body.timestamp}`;
    expect(body.signature).toBe(
      createHash('sha1')
        .update(toSign + API_SECRET)
        .digest('hex'),
    );
    expect(JSON.stringify(body)).not.toContain(API_SECRET);
  });

  it('signs for editor and owner members, refuses readers with 403', async () => {
    const editor = await member(ctx, deck, 'editor');
    const coOwner = await member(ctx, deck, 'owner');
    const reader = await member(ctx, deck, 'reader');
    expect((await sign(ctx, deck.id, ctx.as(editor.email))).status).toBe(200);
    expect((await sign(ctx, deck.id, ctx.as(coOwner.email))).status).toBe(200);
    const res = await sign(ctx, deck.id, ctx.as(reader.email));
    expect(res.status).toBe(403);
    expect((await json(res)).type).toBe('/problems/forbidden');
  });

  it('hides a deck the caller cannot see (404)', async () => {
    const stranger = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(stranger);
    expect((await sign(ctx, deck.id, ctx.as(stranger.email))).status).toBe(404);
    expect((await sign(ctx, 'no-such-deck')).status).toBe(404);
  });

  it('requires a session (401), and an ing_ ingest token is not one', async () => {
    expect((await sign(ctx, deck.id, ctx.anon())).status).toBe(401);
    const created = await ctx.app.request('/me/ingest-tokens', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ label: 'media', deckId: deck.id }),
    });
    expect(created.status).toBe(201);
    const { token } = await json(created);
    expect((await sign(ctx, deck.id, { Authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it(`limits each user to ${MEDIA_SIGN_RATE_PER_HOUR} signs per hour`, async () => {
    const editor = await member(ctx, deck, 'editor');
    for (let i = 0; i < MEDIA_SIGN_RATE_PER_HOUR; i++) {
      expect((await sign(ctx, deck.id, ctx.as(editor.email))).status).toBe(200);
    }
    const res = await sign(ctx, deck.id, ctx.as(editor.email));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('media without CLOUDINARY_URL (US3)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('answers 503 /problems/unavailable for a member who could otherwise upload', async () => {
    const res = await sign(ctx, deck.id);
    expect(res.status).toBe(503);
    expect(await json(res)).toMatchObject({
      type: '/problems/unavailable',
      detail: 'Image uploads are not configured',
    });
  });

  it('still checks access first (404 for an invisible deck)', async () => {
    const stranger = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(stranger);
    expect((await sign(ctx, deck.id, ctx.as(stranger.email))).status).toBe(404);
  });

  it('keeps link previews working', async () => {
    // A private address: answered by safe-fetch's guard, never fetched.
    const res = await ctx.app.request(`/decks/${deck.id}/link-preview`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ url: 'http://127.0.0.1/private' }),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ preview: null });
  });
});
