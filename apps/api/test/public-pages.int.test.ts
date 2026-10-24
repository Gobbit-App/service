import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow, UserRow } from '@pb/db';
import { addMember, createAccountUser, createCategory, createDeck, createItem } from '@pb/db/test';
import { createAnonRateLimiter, type AnonRateLimiter } from '../src/lib/anon-rate-limiter';
import { setupApiTest, TEST_API_URL } from './helpers';

/** IPs under `10.8.` share a tiny limit; everything else is effectively unlimited. */
const LOW_LIMIT = 2;
const LIMITED_PREFIX = '10.8.';
const low = createAnonRateLimiter({ limit: LOW_LIMIT });
const high = createAnonRateLimiter({ limit: 1_000_000 });
const anonLimiter: AnonRateLimiter = {
  hit: (key, now) => (key.startsWith(LIMITED_PREFIX) ? low : high).hit(key, now),
};
const IP_HEADER = 'x-test-client-ip';

const ORIGIN = TEST_API_URL;

const META = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1];

describe('public pages (D177–D181)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: IP_HEADER }, anonLimiter });

  let deck: DeckRow;
  let sharedDeck: DeckRow;
  let emergency: CategoryRow;
  let familyOnly: CategoryRow;
  let member: UserRow;
  let stranger: UserRow;
  const cards: Record<string, ItemRow> = {};

  const text = (title: string, body = '') => ({ type: 'text' as const, title, body, payload: {} });
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

    for (let i = 1; i <= 22; i++) {
      cards[`p${i}`] = await createItem(db, deck, {
        card: text(`Public ${i}`, `Body **${i}**`),
        categoryIds: [emergency.id],
        createdAt: minutesAgo(100 - i),
      });
    }
    cards.shared = await createItem(db, deck, {
      card: text('Family secret'),
      categoryIds: [familyOnly.id],
      createdAt: minutesAgo(1),
    });

    sharedDeck = await createDeck(db, owner, {
      slug: 'cousins',
      name: 'Cousins',
      kind: 'shared',
      isPublic: true,
    });
    const cousinsPublic = await createCategory(db, sharedDeck, {
      slug: 'recipes',
      visibility: 'public',
    });
    cards.cousins = await createItem(db, sharedDeck, {
      card: text('Soup'),
      categoryIds: [cousinsPublic.id],
    });

    await createDeck(db, owner, { slug: 'closed', kind: 'communal', isPublic: false });

    member = await createAccountUser(db, { email: 'member@example.test' });
    stranger = await createAccountUser(db, { email: 'stranger@example.test' });
    await addMember(db, deck, member, 'reader');
    await ctx.sessionFor(member);
    await ctx.sessionFor(stranger);
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    ctx.app.request(path, { headers });
  const cookieOf = (email: string) => ({ Cookie: ctx.asCookie(email).Cookie! });
  const html = async (path: string) => {
    const res = await get(path);
    expect(res.status, path).toBe(200);
    return await res.text();
  };

  describe('pages', () => {
    it('deck page: public categories, newest 20 cards, Older link, cache headers', async () => {
      const res = await get('/p/our-street');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
      expect(res.headers.get('Vary')).toBe('Cookie');
      expect(res.headers.get('X-Robots-Tag')).toBeNull();

      const body = await res.text();
      expect(body).not.toMatch(/<script/i);
      expect(body).toContain('href="/p/our-street/c/emergency"');
      expect(body).not.toContain('family-only');
      expect(body).not.toContain('Family secret');
      expect(body).toContain('Public 22');
      expect(body).not.toContain('>Public 2<');
      const older = /href="(\/p\/our-street\?cursor=[^"]+)" rel="next"/.exec(body)?.[1];
      expect(older).toBeDefined();

      const page2 = await html(older!.replaceAll('&amp;', '&'));
      expect(page2).toContain('>Public 2<');
      expect(page2).toContain('>Public 1<');
      expect(page2).not.toContain('rel="next"');
    });

    it('category and card pages render', async () => {
      expect(await html('/p/our-street/c/emergency')).toContain('<h1>Emergency</h1>');
      const card = await html(`/p/our-street/i/${cards.p3!.id}`);
      expect(card).toContain('<strong>3</strong>');
      expect(META(card, 'og:title')).toBe('Public 3');
      expect(META(card, 'og:url')).toBe(`${ORIGIN}/p/our-street/i/${cards.p3!.id}`);
    });

    it('every "not public" case answers the same 404 page', async () => {
      const paths = [
        '/p/closed',
        '/p/no-such-deck',
        '/p/our-street/c/family-only',
        '/p/our-street/c/nope',
        `/p/our-street/i/${cards.shared!.id}`,
        '/p/our-street/i/not-a-uuid',
        `/p/our-street/i/${Object.values(ctx.world.cards)[0]!.id}`,
      ];
      const bodies: string[] = [];
      for (const path of paths) {
        const res = await get(path);
        expect(res.status, path).toBe(404);
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
        bodies.push(await res.text());
      }
      expect(new Set(bodies).size).toBe(1);
    });

    it('a card under another slug → 301 to its current address', async () => {
      for (const slug of ['old-name', 'cousins']) {
        const res = await get(`/p/${slug}/i/${cards.p1!.id}`);
        expect(res.status).toBe(301);
        expect(res.headers.get('Location')).toBe(`/p/our-street/i/${cards.p1!.id}`);
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
      }
    });

    it('a bad cursor → 400 page', async () => {
      const res = await get('/p/our-street?cursor=garbage');
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Bad request');
    });

    it('over the anonymous limit → 429 page with Retry-After', async () => {
      const limited = { [IP_HEADER]: '10.8.0.1' };
      for (let i = 0; i < LOW_LIMIT; i++) {
        expect((await get('/p/our-street', limited)).status).toBe(200);
      }
      const res = await get('/p/our-street', limited);
      expect(res.status).toBe(429);
      expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(await res.text()).toContain('Too many requests');
    });
  });

  describe('freshness (D180)', () => {
    it('an edit shows on the next request', async () => {
      const path = `/p/our-street/i/${cards.p5!.id}`;
      expect(await html(path)).toContain('Public 5');
      const res = await ctx.app.request(`/items/${cards.p5!.id}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({ title: 'Renamed five' }),
      });
      expect(res.status).toBe(200);
      expect(await html(path)).toContain('Renamed five');
    });

    it('archive and restore show on the next request', async () => {
      const path = `/p/our-street/i/${cards.p6!.id}`;
      await html(path);
      await ctx.app.request(`/items/${cards.p6!.id}/archive`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect((await get(path)).status).toBe(404);
      await ctx.app.request(`/items/${cards.p6!.id}/restore`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect((await get(path)).status).toBe(200);
    });

    it('publishing a proposal shows on the next request', async () => {
      const proposal = await createItem(ctx.t.db, deck, {
        card: text('Fresh proposal'),
        categoryIds: [emergency.id],
        status: 'proposed',
      });
      expect(await html('/p/our-street')).not.toContain('Fresh proposal');
      const res = await ctx.app.request(`/items/${proposal.id}/publish`, {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      expect(await html('/p/our-street')).toContain('Fresh proposal');
    });

    it('a category visibility change shows on the next request', async () => {
      expect(await html('/p/our-street')).not.toContain('/c/family-only');
      const patch = (visibility: string) =>
        ctx.app.request(`/decks/${deck.id}/categories/${familyOnly.id}`, {
          method: 'PATCH',
          headers: ctx.as(),
          body: JSON.stringify({ visibility }),
        });
      expect((await patch('public')).status).toBe(200);
      expect(await html('/p/our-street')).toContain('/c/family-only');
      expect((await patch('shared')).status).toBe(200);
      expect(await html('/p/our-street')).not.toContain('/c/family-only');
    });

    it('un-publishing the deck shows on the next request', async () => {
      await html('/p/our-street');
      const patch = (isPublic: boolean) =>
        ctx.app.request(`/decks/${deck.id}`, {
          method: 'PATCH',
          headers: ctx.as(),
          body: JSON.stringify({ isPublic }),
        });
      expect((await patch(false)).status).toBe(200);
      expect((await get('/p/our-street')).status).toBe(404);
      expect((await patch(true)).status).toBe(200);
      expect((await get('/p/our-street')).status).toBe(200);
    });
  });

  describe('member redirect (D178)', () => {
    it('members are sent to the app route, never cached', async () => {
      const targets: [string, string][] = [
        ['/p/our-street', '/d/our-street'],
        ['/p/our-street/c/emergency', '/d/our-street/c/emergency'],
        [`/p/our-street/i/${cards.p2!.id}`, `/i/${cards.p2!.id}`],
      ];
      for (const email of [member.email, ctx.world.owner.email]) {
        for (const [path, location] of targets) {
          const res = await get(path, cookieOf(email));
          expect(res.status, `${email} ${path}`).toBe(302);
          expect(res.headers.get('Location')).toBe(location);
          expect(res.headers.get('Cache-Control')).toBe('private, no-store');
        }
      }
    });

    it('a signed-in non-member gets the page', async () => {
      const res = await get('/p/our-street', cookieOf(stranger.email));
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    });

    it('?view=public shows the page with a note, privately', async () => {
      const res = await get('/p/our-street?view=public', cookieOf(member.email));
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await res.text()).toContain('class="note"');

      // The member's answer never reaches strangers.
      expect(await html('/p/our-street')).not.toContain('class="note"');
    });

    it('a stale cookie gets the page and is not cleared', async () => {
      const res = await get('/p/our-street', { Cookie: 'gobbit_session=stale-token' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    });
  });

  describe('indexing (D179)', () => {
    it('sitemap lists communal public pages only', async () => {
      const res = await get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^application\/xml/);
      const xml = await res.text();
      const origin = ORIGIN;
      expect(xml).toContain(`<loc>${origin}/p/our-street</loc>`);
      expect(xml).toContain(`<loc>${origin}/p/our-street/c/emergency</loc>`);
      expect(xml).toContain(`<loc>${origin}/p/our-street/i/${cards.p1!.id}</loc>`);
      expect(xml).not.toContain(cards.shared!.id);
      expect(xml).not.toContain('family-only');
      expect(xml).not.toContain('/p/cousins');
      expect(xml).not.toContain('/p/closed');
      expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    });

    it('robots.txt points at the sitemap', async () => {
      const res = await get('/robots.txt');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    });

    it('shared deck pages are noindex', async () => {
      for (const path of ['/p/cousins', `/p/cousins/i/${cards.cousins!.id}`]) {
        const res = await get(path);
        expect(res.status, path).toBe(200);
        expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
        expect(await res.text()).toContain('<meta name="robots" content="noindex">');
      }
    });
  });
});
