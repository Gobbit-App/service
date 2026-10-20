import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, UserRow } from '@pb/db';
import { LINK_PREVIEW_RATE_PER_HOUR } from '@pb/shared';
import { addMember, createAccountUser, createDeck } from '@pb/db/test';
import { createSafeFetch } from '../src/fetch/safe-fetch';
import { isBlockedAddress } from '../src/fetch/ip-guard';
import { json, setupApiTest, type ApiTestContext } from './helpers';

const PAGE = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="  Sourdough   starter guide ">
  <meta property="og:description" content="Feed it twice a day.">
  <meta property="og:image" content="/og.jpg">
  <meta property="og:site_name" content="Bakery">
</head><body><p>Hello</p></body></html>`;

/** Local fixture site; counts hits so tests can prove a blocked URL was never fetched. */
function fixtureServer() {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits++;
    if (req.url === '/plain') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('not html');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  return {
    start: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    url: (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
    get hits() {
      return hits;
    },
  };
}

const site = fixtureServer();
beforeAll(site.start);
afterAll(site.stop);

const lookup = (ctx: ApiTestContext, deck: string, url: unknown, headers = ctx.as()) =>
  ctx.app.request(`/decks/${deck}/link-preview`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
  });

describe('POST /decks/{id}/link-preview (D134)', () => {
  // Test wiring: allow the loopback fixture server (any port); everything else stays guarded.
  const ctx = setupApiTest({
    media: {
      safeFetch: createSafeFetch({
        allowedPorts: null,
        isBlocked: (ip) => ip !== '127.0.0.1' && isBlockedAddress(ip),
      }),
      log: () => {},
    },
  });
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('answers the page’s preview with no-store', async () => {
    const res = await lookup(ctx, deck.slug, site.url('/guide'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toEqual({
      preview: {
        title: 'Sourdough starter guide',
        description: 'Feed it twice a day.',
        image: site.url('/og.jpg'),
      },
    });
  });

  it('serves a repeat lookup from the cache', async () => {
    const before = site.hits;
    expect((await lookup(ctx, deck.id, site.url('/guide'))).status).toBe(200);
    expect(site.hits).toBe(before);
  });

  it('answers null for a non-HTML page, without a reason', async () => {
    expect(await json(await lookup(ctx, deck.id, site.url('/plain')))).toEqual({ preview: null });
  });

  it('rejects a body that is not an http(s) URL (400)', async () => {
    for (const url of ['ftp://example.test/a', 'not a url', 42]) {
      const res = await lookup(ctx, deck.id, url);
      expect(res.status).toBe(400);
      expect((await json(res)).type).toBe('/problems/validation');
    }
  });

  it('refuses readers (403), hides invisible decks (404), requires a session (401)', async () => {
    const reader: UserRow = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, reader, 'reader');
    await ctx.sessionFor(reader);
    const stranger = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(stranger);
    const url = site.url('/guide');
    expect((await lookup(ctx, deck.id, url, ctx.as(reader.email))).status).toBe(403);
    expect((await lookup(ctx, deck.id, url, ctx.as(stranger.email))).status).toBe(404);
    expect((await lookup(ctx, deck.id, url, ctx.anon())).status).toBe(401);
  });

  it(`limits each user to ${LINK_PREVIEW_RATE_PER_HOUR} lookups per hour, cache hits included`, async () => {
    const editor: UserRow = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, editor, 'editor');
    await ctx.sessionFor(editor);
    for (let i = 0; i < LINK_PREVIEW_RATE_PER_HOUR; i++) {
      expect((await lookup(ctx, deck.id, site.url('/guide'), ctx.as(editor.email))).status).toBe(
        200,
      );
    }
    const res = await lookup(ctx, deck.id, site.url('/guide'), ctx.as(editor.email));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('link preview with the default (production) fetcher', () => {
  const ctx = setupApiTest({ media: { log: () => {} } });
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('answers null for a private address and never reaches it', async () => {
    const before = site.hits;
    const res = await lookup(ctx, deck.id, site.url('/guide'));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ preview: null });
    expect(site.hits).toBe(before);
  });
});
