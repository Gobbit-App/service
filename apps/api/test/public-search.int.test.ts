import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow, UserRow } from '@gobbit/db';
import { SEARCH_Q_MAX } from '@gobbit/shared';
import {
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { createAnonRateLimiter, type AnonRateLimiter } from '../src/lib/anon-rate-limiter';
import { json, setupApiTest } from './helpers';

const IP_HEADER = 'x-test-client-ip';
const text = (title: string, body = '') => ({ type: 'text' as const, title, body, payload: {} });

interface PublicHit {
  item: Record<string, unknown> & { id: string; title: string };
  why: 'text' | 'semantic' | 'both';
  score: number;
}

/** IPs under `10.9.` share a tiny search limit; everything else is effectively unlimited. */
const SEARCH_LIMIT = 2;
const LIMITED_PREFIX = '10.9.';
const lowSearch = createAnonRateLimiter({ limit: SEARCH_LIMIT });
const highSearch = createAnonRateLimiter({ limit: 1_000_000 });
const anonSearchLimiter: AnonRateLimiter = {
  hit: (key, now) => (key.startsWith(LIMITED_PREFIX) ? lowSearch : highSearch).hit(key, now),
};

describe('public search (D182, D183)', () => {
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER },
    search: { embedder: createFakeEmbedder() },
    anonSearchLimiter,
  });

  let deck: DeckRow;
  let allPublic: DeckRow;
  let open: CategoryRow;
  let member: UserRow;
  const cards: Record<string, ItemRow> = {};

  beforeAll(async () => {
    const db = ctx.t.db;
    const owner = ctx.world.owner;
    deck = await createDeck(db, owner, {
      slug: 'our-street',
      name: 'Our street',
      kind: 'communal',
      isPublic: true,
    });
    open = await createCategory(db, deck, { slug: 'emergency', visibility: 'public' });
    const family = await createCategory(db, deck, { slug: 'family', visibility: 'shared' });
    const secret = await createCategory(db, deck, { slug: 'secret', visibility: 'private' });

    cards.open = await createItem(db, deck, {
      card: text('Water shut-off', 'The quokka valve is under the stairs'),
      categoryIds: [open.id],
    });
    cards.shared = await createItem(db, deck, {
      card: text('Xylophone code', 'Family only'),
      categoryIds: [family.id],
    });
    cards.mixed = await createItem(db, deck, {
      card: text('Numbat notes', 'Public through one of its categories'),
      categoryIds: [secret.id, open.id],
    });
    cards.private = await createItem(db, deck, {
      card: text('Pomegranate safe', 'Private'),
      categoryIds: [secret.id],
    });
    cards.proposed = await createItem(db, deck, {
      card: text('Trampoline proposal', 'Not reviewed'),
      categoryIds: [open.id],
      status: 'proposed',
      verifiedAt: null,
    });
    cards.archived = await createItem(db, deck, {
      card: text('Saxophone archived', 'Old'),
      categoryIds: [open.id],
      status: 'archived',
    });

    allPublic = await createDeck(db, owner, {
      slug: 'all-public',
      kind: 'communal',
      isPublic: true,
    });
    const shelf = await createCategory(db, allPublic, { slug: 'shelf', visibility: 'public' });
    for (const title of ['Garden hose', 'Garden gate key', 'Gardening club', 'Hose reel']) {
      await createItem(db, allPublic, {
        card: text(title, 'garden things'),
        categoryIds: [shelf.id],
      });
    }

    await createDeck(db, owner, { slug: 'closed', kind: 'communal', isPublic: false });

    member = await createAccountUser(db, { email: 'member@example.test' });
    await addMember(db, deck, member, 'reader');
    await ctx.sessionFor(member);
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    ctx.app.request(path, { headers });
  const searchJson = (slug: string, q: string, headers: Record<string, string> = {}) =>
    get(`/public/${slug}/search?${new URLSearchParams({ q })}`, headers);
  const ids = async (slug: string, q: string): Promise<string[]> => {
    const res = await searchJson(slug, q);
    expect(res.status).toBe(200);
    return ((await json(res)).data as PublicHit[]).map((h) => h.item.id);
  };

  describe('JSON route', () => {
    it('answers public hits as PublicItems, cacheable for a minute', async () => {
      const res = await searchJson('our-street', 'quokka');
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      const body = await json(res);
      expect(body.semantic).toBe(true);
      expect(body.data).toHaveLength(1);
      const hit = body.data[0] as PublicHit;
      expect(hit.item.id).toBe(cards.open!.id);
      expect(hit.why).toMatch(/text|both/);
      expect(hit.item).not.toHaveProperty('favorite');
      expect(hit.item).not.toHaveProperty('createdBy');
    });

    it('never returns shared, private, proposed or archived cards', async () => {
      for (const word of ['xylophone', 'pomegranate', 'trampoline', 'saxophone']) {
        expect(await ids('our-street', word), word).toEqual([]);
      }
      expect(await ids('our-street', 'numbat')).toEqual([cards.mixed!.id]);
    });

    it('orders like member search when everything is public', async () => {
      const q = 'garden';
      const memberRes = await get(`/decks/all-public/search?q=${q}`, ctx.as());
      const memberIds = ((await json(memberRes)).data as PublicHit[]).map((h) => h.item.id);
      expect(memberIds.length).toBeGreaterThan(1);
      expect(await ids('all-public', q)).toEqual(memberIds);
    });

    it('limits results', async () => {
      const res = await get('/public/all-public/search?q=garden&limit=1');
      expect((await json(res)).data).toHaveLength(1);
    });

    it('400 for a missing, too long or bad-limit query', async () => {
      for (const query of [
        '',
        'q=',
        `q=${'x'.repeat(SEARCH_Q_MAX + 1)}`,
        'q=x&limit=21',
        'q=x&limit=0',
      ]) {
        const res = await get(`/public/our-street/search?${query}`);
        expect(res.status, query).toBe(400);
        expect(res.headers.get('Content-Type')).toMatch(/problem\+json/);
      }
    });

    it('404 for a deck that is not public; there is no public Ask', async () => {
      expect((await searchJson('closed', 'x')).status).toBe(404);
      expect((await searchJson('no-such-deck', 'x')).status).toBe(404);
      expect((await get('/public/our-street/ask?q=x')).status).toBe(404);
    });

    it('logs mode=public with no user (D183)', async () => {
      await ids('our-street', 'Stairs');
      await new Promise((r) => setTimeout(r, 50));
      const { rows } = await ctx.t.pool.query(
        `select mode, user_id, result_count from search_queries where deck_id = $1 and q_normalized = 'stairs'`,
        [deck.id],
      );
      expect(rows).toEqual([{ mode: 'public', user_id: null, result_count: 1 }]);
    });
  });

  describe('page', () => {
    it('lists results, noindex, short cache, never the page cache', async () => {
      const res = await get('/p/our-street/search?q=quokka');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(res.headers.get('Vary')).toBe('Cookie');
      const body = await res.text();
      expect(body).not.toMatch(/<script/i);
      expect(body).toContain(`href="/p/our-street/i/${cards.open!.id}"`);
      expect(body).not.toContain('Xylophone');
    });

    it('escapes the query', async () => {
      const q = '"><script>alert(1)</script>';
      const body = await (await get(`/p/our-street/search?${new URLSearchParams({ q })}`)).text();
      expect(body).not.toMatch(/<script/i);
      expect(body).toContain('&lt;script&gt;');
    });

    it('an empty query shows only the form', async () => {
      const res = await get('/p/our-street/search');
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('role="search"');
      expect(body).not.toContain('No public cards match.');
    });

    it('the deck page links to it with a search form', async () => {
      const body = await (await get('/p/our-street')).text();
      expect(body).toContain('action="/p/our-street/search"');
    });

    it('members go to the app search', async () => {
      const res = await get('/p/our-street/search?q=a%20b', {
        Cookie: ctx.asCookie(member.email).Cookie!,
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/d/our-street/search?q=a%20b');
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('404 page for a deck that is not public', async () => {
      const res = await get('/p/closed/search?q=x');
      expect(res.status).toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    });
  });

  it('over the search limit → 429 (JSON and page) while page reads go on', async () => {
    const limited = { [IP_HEADER]: '10.9.0.1' };
    for (let i = 0; i < SEARCH_LIMIT; i++) {
      expect((await searchJson('our-street', `limit ${i}`, limited)).status).toBe(200);
    }
    const res = await searchJson('our-street', 'one more', limited);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);

    const page = await get('/p/our-street/search?q=x', limited);
    expect(page.status).toBe(429);
    expect(page.headers.get('Content-Type')).toMatch(/^text\/html/);

    expect((await get('/p/our-street', limited)).status).toBe(200);
    expect((await get('/public/our-street', limited)).status).toBe(200);
  });
});

describe('public search embedding budgets (D182)', () => {
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER },
    search: {
      embedder: createFakeEmbedder(),
      queryBudgetLimits: { perUser: 100, anonPerIp: 2, anonGlobal: 3 },
    },
  });

  beforeAll(async () => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner, {
      slug: 'budget',
      kind: 'communal',
      isPublic: true,
    });
    const cat = await createCategory(ctx.t.db, deck, { visibility: 'public' });
    await createItem(ctx.t.db, deck, { card: text('Budget card'), categoryIds: [cat.id] });
  });

  const semantic = async (q: string, ip: string): Promise<boolean> => {
    const res = await ctx.app.request(`/public/budget/search?${new URLSearchParams({ q })}`, {
      headers: { [IP_HEADER]: ip },
    });
    expect(res.status).toBe(200);
    return (await json(res)).semantic as boolean;
  };

  it('per-IP and global caps fall back to text; cached queries stay semantic', async () => {
    expect(await semantic('alpha', '198.51.100.1')).toBe(true);
    expect(await semantic('beta', '198.51.100.1')).toBe(true);
    // The per-IP cap (2) is spent.
    expect(await semantic('gamma', '198.51.100.1')).toBe(false);
    // Another IP still has its own budget, and takes the last global unit (3).
    expect(await semantic('delta', '198.51.100.2')).toBe(true);
    // The global cap is spent: a third IP falls back to text.
    expect(await semantic('epsilon', '198.51.100.3')).toBe(false);
    // A cached query costs nothing, so it stays semantic for anyone.
    expect(await semantic('alpha', '198.51.100.3')).toBe(true);

    const { rows } = await ctx.t.pool.query<{ n: string }>(
      `select count(*)::int as n from llm_calls where user_id is null`,
    );
    expect(Number(rows[0]!.n)).toBe(3);
  });

  it('a member search is not limited by the anonymous budgets', async () => {
    const res = await ctx.app.request('/decks/budget/search?q=zeta', { headers: ctx.as() });
    expect((await json(res)).semantic).toBe(true);
  });
});

describe('public search without an embedding key (D182)', () => {
  const ctx = setupApiTest({ search: { embedder: null } });

  beforeAll(async () => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner, {
      slug: 'no-key',
      kind: 'communal',
      isPublic: true,
    });
    const cat = await createCategory(ctx.t.db, deck, { visibility: 'public' });
    await createItem(ctx.t.db, deck, { card: text('Keyless card'), categoryIds: [cat.id] });
  });

  it('answers text-only results', async () => {
    const res = await ctx.app.request('/public/no-key/search?q=keyless');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.semantic).toBe(false);
    expect(body.data).toHaveLength(1);
  });
});
