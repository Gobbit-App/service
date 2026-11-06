import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, UserRow } from '@gobbit/db';
import { LINK_PREVIEW_RATE_PER_HOUR } from '@gobbit/shared';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import {
  createSafeFetch,
  createSafeImageFetch,
  createSafeJsonFetch,
  type SafeFetch,
  type SafeJsonFetch,
} from '../src/fetch/safe-fetch';
import { isBlockedAddress } from '../src/fetch/ip-guard';
import { BROWSER_USER_AGENT, CRAWLER_USER_AGENT } from '../src/fetch/user-agents';
import { createLinkCheckFetch } from '../src/services/media-wiring';
import { json, setupApiTest, type ApiTestContext } from './helpers';

const PAGE = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="  Sourdough   starter guide ">
  <meta property="og:description" content="Feed it twice a day.">
  <meta property="og:image" content="/og.jpg">
  <meta property="og:site_name" content="Bakery">
</head><body><p>Hello</p></body></html>`;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const THUMB = 'https://i.ytimg.com/vi/loaf/hqdefault.jpg';

/** Stand-in for a lookup host: `/yt/watch` pages and the `/yt/oembed` endpoint (D345). */
function videoHost(path: URL, res: import('node:http').ServerResponse): void {
  if (path.pathname === '/yt/watch') {
    // `?v=ok`: a bare page (no title, no image), so only the lookup can fill it.
    const head = path.searchParams.get('v') === 'ok' ? '' : '<title>Page title</title>';
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><head>${head}</head></html>`);
    return;
  }
  const target = path.searchParams.get('url') ?? '';
  if (target.includes('v=fail')) {
    res.writeHead(500).end();
    return;
  }
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ title: 'Loaf video', thumbnail_url: THUMB, author_name: 'ignored' }));
}

/**
 * Local fixture site; counts hits so tests can prove a blocked URL was never fetched, and records
 * the User-Agent of every request by path (D343).
 */
function fixtureServer() {
  let hits = 0;
  const agents = new Map<string, string | undefined>();
  const server: Server = createServer((req, res) => {
    hits++;
    const path = new URL(req.url ?? '/', 'http://fixture');
    agents.set(path.pathname, req.headers['user-agent']);
    if (path.pathname.startsWith('/yt/')) {
      videoHost(path, res);
      return;
    }
    if (path.pathname === '/plain') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('not html');
      return;
    }
    if (path.pathname === '/og.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  return {
    agents,
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

// Test wiring: allow the loopback fixture server (any port); everything else stays guarded.
const loopback = {
  allowedPorts: null,
  isBlocked: (ip: string) => ip !== '127.0.0.1' && isBlockedAddress(ip),
};
const quiet = { info: () => {}, warn: () => {} };

describe('POST /decks/{id}/link-preview (D134)', () => {
  const ctx = setupApiTest({
    media: { safeFetch: createSafeFetch(loopback), fetchJson: null, log: quiet },
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
  const ctx = setupApiTest({ media: { log: { info: () => {}, warn: () => {} } } });
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

describe('outbound identity (D343)', () => {
  const ctx = setupApiTest({
    media: { safeFetch: createSafeFetch(loopback), fetchJson: null, log: quiet },
  });
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('page fetches for the editor preview say GobbitBot', async () => {
    expect((await lookup(ctx, deck.id, site.url('/ua-page'))).status).toBe(200);
    expect(site.agents.get('/ua-page')).toBe(CRAWLER_USER_AGENT);
    expect(CRAWLER_USER_AGENT).toContain('GobbitBot/1.0');
  });

  it('image downloads and host lookups say GobbitBot', async () => {
    const image = await createSafeImageFetch(loopback)(site.url('/og.png'));
    expect(image.error).toBeNull();
    expect(site.agents.get('/og.png')).toBe(CRAWLER_USER_AGENT);

    const answer = await createSafeJsonFetch(loopback)(site.url('/yt/oembed?url=x'));
    expect(answer.json).toMatchObject({ title: 'Loaf video' });
    expect(site.agents.get('/yt/oembed')).toBe(CRAWLER_USER_AGENT);
  });

  it('link checks keep the browser identity', async () => {
    const result = await createLinkCheckFetch(loopback)(site.url('/ua-check'));
    expect(result.status).toBe(200);
    expect(site.agents.get('/ua-check')).toBe(BROWSER_USER_AGENT);
    expect(BROWSER_USER_AGENT).not.toContain('GobbitBot');
  });
});

/** Sends a youtube.com URL (page or oEmbed endpoint) to the fixture server's `/yt/` paths. */
function toFixture(url: string): string {
  const u = new URL(url);
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) return url;
  return site.url(`/yt${u.pathname}${u.search}`);
}

describe('editor preview for a lookup host (D345)', () => {
  const pageFetch = createSafeFetch(loopback);
  const jsonFetch = createSafeJsonFetch(loopback);
  const lookups: string[] = [];
  const safeFetch: SafeFetch = (url) => pageFetch(toFixture(url));
  const fetchJson: SafeJsonFetch = (url) => {
    lookups.push(url);
    return jsonFetch(toFixture(url));
  };
  const ctx = setupApiTest({ media: { safeFetch, fetchJson, log: quiet } });
  let deck: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('fills a bare page from the oEmbed title and thumbnail', async () => {
    const url = 'https://www.youtube.com/watch?v=ok';
    const res = await lookup(ctx, deck.id, url);

    expect(await json(res)).toEqual({ preview: { title: 'Loaf video', image: THUMB } });
    expect(lookups).toEqual([
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    ]);
  });

  it('still answers the page preview when the lookup fails', async () => {
    const res = await lookup(ctx, deck.id, 'https://www.youtube.com/watch?v=fail');

    expect(await json(res)).toEqual({ preview: { title: 'Page title' } });
    expect(lookups).toHaveLength(2);
  });
});
