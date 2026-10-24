import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow } from '@pb/db';
import { createCategory, createDeck, createItem } from '@pb/db/test';
import { publicDeckSchema, publicItemPageSchema, publicItemSchema } from '@pb/shared';
import { createAnonRateLimiter, type AnonRateLimiter } from '../src/lib/anon-rate-limiter';
import { json, setupApiTest } from './helpers';

/** IPs under `10.9.` share a tiny limit; everything else is effectively unlimited. */
const LOW_LIMIT = 3;
const LIMITED_PREFIX = '10.9.';
const low = createAnonRateLimiter({ limit: LOW_LIMIT });
const high = createAnonRateLimiter({ limit: 1_000_000 });
const anonLimiter: AnonRateLimiter = {
  hit: (key, now) => (key.startsWith(LIMITED_PREFIX) ? low : high).hit(key, now),
};

const IP_HEADER = 'x-test-client-ip';

describe('public read API (D174, D175)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: IP_HEADER }, anonLimiter });

  let deck: DeckRow;
  let emergency: CategoryRow;
  let familyOnly: CategoryRow;
  let adminOnly: CategoryRow;
  let removedCategory: CategoryRow;
  const cards: Record<string, ItemRow> = {};

  const text = (title: string) => ({ type: 'text' as const, title, payload: {} });
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

  beforeAll(async () => {
    const db = ctx.t.db;
    const owner = ctx.world.owner;
    deck = await createDeck(db, owner, {
      slug: 'our-street',
      name: 'Our street',
      kind: 'communal',
      isPublic: true,
    });
    emergency = await createCategory(db, deck, {
      slug: 'emergency',
      name: 'Emergency',
      visibility: 'public',
      position: 1,
    });
    familyOnly = await createCategory(db, deck, {
      slug: 'family-only',
      visibility: 'shared',
      position: 2,
    });
    adminOnly = await createCategory(db, deck, {
      slug: 'admin',
      visibility: 'private',
      position: 3,
    });
    removedCategory = await createCategory(db, deck, {
      slug: 'old',
      visibility: 'public',
      position: 4,
    });

    const add = async (
      key: string,
      categoryIds: string[],
      opts: { status?: 'published' | 'proposed' | 'archived'; age: number },
    ) => {
      cards[key] = await createItem(db, deck, {
        card: text(key),
        categoryIds,
        status: opts.status,
        createdAt: minutesAgo(opts.age),
      });
    };

    await add('public1', [emergency.id], { age: 10 });
    await add('public2', [emergency.id], { age: 9 });
    await add('public3', [emergency.id], { age: 8 });
    await add('mixed', [emergency.id, familyOnly.id, adminOnly.id], { age: 7 });
    await add('shared', [familyOnly.id], { age: 6 });
    await add('private', [adminOnly.id], { age: 5 });
    await add('proposed', [emergency.id], { status: 'proposed', age: 4 });
    await add('archived', [emergency.id], { status: 'archived', age: 3 });
    await add('deleted', [emergency.id], { age: 2 });
    await add('inRemovedCategory', [removedCategory.id], { age: 1 });

    await ctx.t.pool.query('UPDATE items SET deleted_at = now() WHERE id = $1', [
      cards.deleted!.id,
    ]);
    await ctx.t.pool.query('UPDATE categories SET deleted_at = now() WHERE id = $1', [
      removedCategory.id,
    ]);

    // Decks strangers must never reach.
    await createDeck(db, owner, { slug: 'private-deck', kind: 'communal', isPublic: false });
    await createDeck(db, owner, { slug: 'personal-public', kind: 'personal', isPublic: true });
    const gone = await createDeck(db, owner, { slug: 'gone-deck', kind: 'shared', isPublic: true });
    await ctx.t.pool.query('UPDATE decks SET deleted_at = now() WHERE id = $1', [gone.id]);
  });

  const get = (path: string, headers: Record<string, string> = ctx.anon()) =>
    ctx.app.request(path, { headers });

  async function allIds(query = ''): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams(query);
      qs.set('limit', '2');
      if (cursor) qs.set('cursor', cursor);
      const res = await get(`/public/our-street/items?${qs}`);
      expect(res.status).toBe(200);
      const page = publicItemPageSchema.parse(await json(res));
      ids.push(...page.data.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    return ids;
  }

  describe('deck rule', () => {
    it('summary lists only live public categories with published counts', async () => {
      const res = await get('/public/our-street');
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      const body = publicDeckSchema.parse(await json(res));
      expect(body).toEqual({
        slug: 'our-street',
        name: 'Our street',
        kind: 'communal',
        categories: [{ slug: 'emergency', name: 'Emergency', itemCount: 4 }],
      });
    });

    it('private, personal, deleted and unknown decks answer one identical 404', async () => {
      const bodies = [];
      for (const slug of ['private-deck', 'personal-public', 'gone-deck', 'no-such-deck']) {
        for (const path of [`/public/${slug}`, `/public/${slug}/items`]) {
          const res = await get(path);
          expect(res.status).toBe(404);
          bodies.push(await json(res));
        }
      }
      for (const body of bodies) {
        expect(body).toEqual(bodies[0]);
      }
      expect(bodies[0].detail).toBe('Deck not found');
    });

    it('a deck made private again disappears', async () => {
      await ctx.t.pool.query('UPDATE decks SET is_public = false WHERE id = $1', [deck.id]);
      expect((await get('/public/our-street')).status).toBe(404);
      await ctx.t.pool.query('UPDATE decks SET is_public = true WHERE id = $1', [deck.id]);
      expect((await get('/public/our-street')).status).toBe(200);
    });
  });

  describe('list', () => {
    it('pages published public cards newest first and nothing else', async () => {
      const ids = await allIds();
      expect(ids).toEqual([
        cards.mixed!.id,
        cards.public3!.id,
        cards.public2!.id,
        cards.public1!.id,
      ]);
    });

    it('filters by a public category', async () => {
      expect(await allIds('category=emergency')).toHaveLength(4);
    });

    it('a shared, private, deleted or unknown category is 404', async () => {
      for (const slug of ['family-only', 'admin', 'old', 'nope']) {
        expect((await get(`/public/our-street/items?category=${slug}`)).status).toBe(404);
      }
    });

    it('a mixed card lists only its public category', async () => {
      const page = publicItemPageSchema.parse(await json(await get('/public/our-street/items')));
      const mixed = page.data.find((i) => i.id === cards.mixed!.id);
      expect(mixed?.categories).toEqual([{ slug: 'emergency', name: 'Emergency' }]);
    });

    it('bad limit or cursor → 400', async () => {
      expect((await get('/public/our-street/items?limit=51')).status).toBe(400);
      expect((await get('/public/our-street/items?limit=0')).status).toBe(400);
      expect((await get('/public/our-street/items?cursor=garbage')).status).toBe(400);
    });

    it('sets the public cache header', async () => {
      const res = await get('/public/our-street/items');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    });
  });

  describe('single card', () => {
    it('returns a public card with the allow-listed fields', async () => {
      const res = await get(`/public/our-street/items/${cards.public1!.id}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
      const body = await json(res);
      expect(publicItemSchema.strict().safeParse(body).success).toBe(true);
      expect(body.title).toBe('public1');
    });

    it('shared, private, proposed, archived, deleted and removed-category cards are 404', async () => {
      for (const key of [
        'shared',
        'private',
        'proposed',
        'archived',
        'deleted',
        'inRemovedCategory',
      ]) {
        const res = await get(`/public/our-street/items/${cards[key]!.id}`);
        expect(res.status, key).toBe(404);
      }
    });

    it('a card of another deck or a malformed id is 404', async () => {
      const familyCard = Object.values(ctx.world.cards)[0]!;
      expect((await get(`/public/our-street/items/${familyCard.id}`)).status).toBe(404);
      expect((await get('/public/our-street/items/not-a-uuid')).status).toBe(404);
    });
  });

  describe('caller identity', () => {
    it("the owner's cookie gets exactly the stranger's answer", async () => {
      for (const path of [
        '/public/our-street',
        '/public/our-street/items',
        `/public/our-street/items/${cards.mixed!.id}`,
      ]) {
        const anonymous = await json(await get(path));
        const owner = await json(await get(path, ctx.asCookie()));
        expect(owner).toEqual(anonymous);
      }
    });

    it('a stale cookie is ignored: 200 and the cookie is not cleared', async () => {
      const res = await get('/public/our-street', { Cookie: 'gobbit_session=stale-token' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    });

    it('a bad bearer or an ingest token is ignored as well', async () => {
      for (const token of ['not-a-session', 'ing_not-a-token']) {
        const res = await get('/public/our-street', { Authorization: `Bearer ${token}` });
        expect(res.status, token).toBe(200);
      }
    });
  });

  describe('anonymous limit', () => {
    it('over the limit → 429 with Retry-After; other IPs and member routes unaffected', async () => {
      const limited = { [IP_HEADER]: '10.9.0.1' };
      for (let i = 0; i < LOW_LIMIT; i++) {
        expect((await get('/public/our-street', limited)).status).toBe(200);
      }
      const refused = await get('/public/our-street', limited);
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect((await json(refused)).type).toBe('/problems/rate-limited');

      expect((await get('/public/our-street', { [IP_HEADER]: '10.9.0.2' })).status).toBe(200);
      const member = await ctx.app.request('/decks', { headers: { ...ctx.as(), ...limited } });
      expect(member.status).toBe(200);
    });
  });
});
