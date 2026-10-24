import { describe, expect, it, vi } from 'vitest';
import { encodeCursor, type PublicItem } from '@pb/shared';
import type { CurrentUser } from '../types';
import type { SitemapRepo } from '../repositories/sitemap.repo';
import { createPageCache } from '../public/page-cache';
import type { PublicDeckRow } from './public-deck.service';
import { createPublicPagesService } from './public-pages.service';

const ORIGIN = 'https://gobbit.example';
const ITEM_ID = '0b9a3c1e-4f2d-4c6b-9a8e-1d2c3b4a5f60';

const deck = {
  id: 'deck-1',
  slug: 'our-street',
  name: 'Our street',
  kind: 'communal',
  isPublic: true,
  isDefault: false,
  ownerAccountId: 'acct-owner',
} as PublicDeckRow;

const item: PublicItem = {
  id: ITEM_ID,
  type: 'text',
  title: 'Water shut-off',
  body: 'Valve by the gate.',
  payload: {},
  entities: {},
  sourceUrl: null,
  verifiedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  categories: [{ slug: 'emergency', name: 'Emergency' }],
} as unknown as PublicItem;

const user = (accountId: string): CurrentUser => ({
  id: `user-${accountId}`,
  accountId,
  email: `${accountId}@example.test`,
  displayName: accountId,
});

function setup({ memberRole }: { memberRole?: 'reader' } = {}) {
  const summaryFor = vi.fn(async () => ({
    slug: deck.slug,
    name: deck.name,
    kind: 'communal' as const,
    categories: [{ slug: 'emergency', name: 'Emergency', itemCount: 1 }],
  }));
  const listFor = vi.fn(async () => ({ data: [item], nextCursor: null }));
  const itemById = vi.fn(async (id: string) => (id === ITEM_ID ? { deck, item } : null));
  const retrievePublic = vi.fn(async () => ({
    data: [{ item, why: 'text' as const, score: 0.03 }],
    semantic: false,
  }));
  const findActive = vi.fn(async () =>
    memberRole ? { role: memberRole, acceptedAt: new Date(), deletedAt: null } : null,
  );
  const service = createPublicPagesService({
    publicDecks: { summaryFor, listFor, itemById },
    decks: { findBySlug: vi.fn(async (slug: string) => (slug === deck.slug ? deck : null)) },
    memberships: { findActive } as never,
    sitemap: {} as SitemapRepo,
    share: {
      origin: ORIGIN,
      siteImageUrl: `${ORIGIN}/og/private.png`,
      imageUrl: () => null,
      ogImageFor: vi.fn(async () => `${ORIGIN}/og/private.png`),
    },
    cache: createPageCache(),
    search: { retrievePublic },
  });
  return { service, summaryFor, findActive, retrievePublic };
}

describe('public pages service (D177, D178, D180)', () => {
  it('serves strangers from the cache after the first render', async () => {
    const { service, summaryFor } = setup();
    const first = await service.deckPage('our-street', {});
    const second = await service.deckPage('our-street', {});

    expect(first.status).toBe(200);
    expect(first.headers['Cache-Control']).toBe('public, max-age=300');
    expect(second.html).toBe(first.html);
    expect(summaryFor).toHaveBeenCalledOnce();
  });

  it('redirects the owner and members to the app route without caching', async () => {
    const { service } = setup({ memberRole: 'reader' });
    for (const u of [user('acct-owner'), user('acct-member')]) {
      const res = await service.categoryPage('our-street', 'emergency', { user: u });
      expect(res.status).toBe(302);
      expect(res.headers.Location).toBe('/d/our-street/c/emergency');
      expect(res.headers['Cache-Control']).toBe('private, no-store');
    }
  });

  it('skips the membership lookup for the owner', async () => {
    const { service, findActive } = setup();
    await service.deckPage('our-street', { user: user('acct-owner') });
    expect(findActive).not.toHaveBeenCalled();
  });

  it('treats a signed-in non-member as a stranger', async () => {
    const { service } = setup();
    const res = await service.itemPage('our-street', ITEM_ID, { user: user('acct-x') });
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=300');
  });

  it('?view=public renders privately with the note and never fills the cache', async () => {
    const { service, summaryFor } = setup({ memberRole: 'reader' });
    const member = await service.deckPage('our-street', {
      user: user('acct-member'),
      view: 'public',
    });
    expect(member.status).toBe(200);
    expect(member.headers['Cache-Control']).toBe('private, no-store');
    expect(member.html).toContain('class="note"');

    const stranger = await service.deckPage('our-street', {});
    expect(stranger.html).not.toContain('class="note"');
    expect(summaryFor).toHaveBeenCalledTimes(2);
  });

  it('a card under another slug → 301 to its current address', async () => {
    const res = await setup().service.itemPage('old-slug', ITEM_ID, {});
    expect(res.status).toBe(301);
    expect(res.headers.Location).toBe(`/p/our-street/i/${ITEM_ID}`);
  });

  it('a bad cursor → 400; a good one renders', async () => {
    const { service } = setup();
    expect((await service.deckPage('our-street', { cursor: 'garbage' })).status).toBe(400);
    const cursor = encodeCursor({ createdAt: item.createdAt, id: ITEM_ID });
    expect((await service.deckPage('our-street', { cursor })).status).toBe(200);
  });

  it('unknown deck, category or card → 404', async () => {
    const { service } = setup();
    expect((await service.deckPage('nope', {})).status).toBe(404);
    expect((await service.categoryPage('our-street', 'nope', {})).status).toBe(404);
    expect((await service.itemPage('our-street', 'nope', {})).status).toBe(404);
  });

  describe('search page (D182)', () => {
    const IP = '203.0.113.7';

    it('renders public results, noindex, never from the page cache', async () => {
      const { service, retrievePublic } = setup();
      const first = await service.searchPage('our-street', { q: '  water ' }, IP);
      await service.searchPage('our-street', { q: 'water' }, IP);

      expect(first.status).toBe(200);
      expect(first.headers['Cache-Control']).toBe('public, max-age=60');
      expect(first.headers['X-Robots-Tag']).toBe('noindex');
      expect(first.html).toContain('Water shut-off');
      expect(first.html).toContain('Text matches only.');
      expect(retrievePublic).toHaveBeenCalledTimes(2);
      expect(retrievePublic).toHaveBeenCalledWith(deck, 'water', 10, IP);
    });

    it('an empty query renders the form only', async () => {
      const { service, retrievePublic } = setup();
      const res = await service.searchPage('our-street', {}, IP);
      expect(res.status).toBe(200);
      expect(res.html).toContain('role="search"');
      expect(res.html).not.toContain('Water shut-off');
      expect(retrievePublic).not.toHaveBeenCalled();
    });

    it('members go to the app search with the query', async () => {
      const { service, retrievePublic } = setup({ memberRole: 'reader' });
      const res = await service.searchPage('our-street', { q: 'a b', user: user('acct-m') }, IP);
      expect(res.status).toBe(302);
      expect(res.headers.Location).toBe('/d/our-street/search?q=a%20b');
      expect(res.headers['Cache-Control']).toBe('private, no-store');
      expect(retrievePublic).not.toHaveBeenCalled();
    });

    it('unknown deck → 404; a too-long query → 400', async () => {
      const { service } = setup();
      expect((await service.searchPage('nope', { q: 'x' }, IP)).status).toBe(404);
      expect((await service.searchPage('our-street', { q: 'x'.repeat(201) }, IP)).status).toBe(400);
    });
  });
});
