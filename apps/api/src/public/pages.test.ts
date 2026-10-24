import { describe, expect, it } from 'vitest';
import type { PublicDeck, PublicItem } from '@pb/shared';
import {
  badRequestPage,
  categoryPage,
  deckPage,
  itemPage,
  notFoundPage,
  rateLimitedPage,
  type PageContext,
} from './pages';

const ORIGIN = 'https://gobbit.example';
const ctx: PageContext = {
  origin: ORIGIN,
  robots: 'index',
  publicViewNote: false,
  imageUrl: (id, t) => `https://res.cloudinary.com/demo/image/upload/${t}/${id}`,
  siteImage: `${ORIGIN}/og/private.png`,
};

const deck: PublicDeck = {
  slug: 'our-street',
  name: 'Our street',
  kind: 'communal',
  categories: [{ slug: 'emergency', name: 'Emergency', itemCount: 2 }],
};

function card(over: Partial<PublicItem> = {}): PublicItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'text',
    title: 'Water shut-off',
    body: 'The valve is **behind** the bins.',
    payload: {},
    entities: {},
    sourceUrl: null,
    verifiedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    categories: [{ slug: 'emergency', name: 'Emergency' }],
    ...over,
  } as PublicItem;
}

const meta = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1];

const allPages = () => [
  deckPage(ctx, { deck, items: [card()], nextCursor: 'abc' }),
  categoryPage(ctx, { deck, category: deck.categories[0]!, items: [card()], nextCursor: null }),
  itemPage(ctx, { deck, item: card(), ogImage: 'https://res.cloudinary.com/demo/og.jpg' }),
  notFoundPage(),
  rateLimitedPage(),
  badRequestPage(),
];

describe('public pages (D177)', () => {
  it('no page contains a script', () => {
    for (const page of allPages()) {
      expect(page).not.toMatch(/<script/i);
      expect(page).toMatch(/^<!doctype html>/);
    }
  });

  it('a Hebrew card page is lang="he" dir="rtl" with og:locale he_IL', () => {
    const page = itemPage(ctx, {
      deck,
      item: card({ title: 'סגירת מים', body: 'הברז נמצא מאחורי הפחים' }),
      ogImage: 'https://x/og.jpg',
    });
    expect(page).toContain('<html lang="he" dir="rtl">');
    expect(meta(page, 'og:locale')).toBe('he_IL');
  });

  it('"Older" only when there is a next cursor', () => {
    const [withNext, withoutNext] = [
      deckPage(ctx, { deck, items: [card()], nextCursor: 'a/b' }),
      deckPage(ctx, { deck, items: [card()], nextCursor: null }),
    ];
    expect(withNext).toContain('href="/p/our-street?cursor=a%2Fb" rel="next">Older<');
    expect(withoutNext).not.toContain('Older');
  });

  it('deck page lists categories with counts and links cards', () => {
    const page = deckPage(ctx, { deck, items: [card()], nextCursor: null });
    expect(page).toContain('href="/p/our-street/c/emergency"');
    expect(page).toContain('href="/p/our-street/i/00000000-0000-4000-8000-000000000001"');
    expect(page).toContain('The valve is behind the bins.');
  });

  it('shows the public-view note only when asked', () => {
    expect(itemPage(ctx, { deck, item: card(), ogImage: 'x' })).not.toContain('class="note"');
    expect(
      itemPage({ ...ctx, publicViewNote: true }, { deck, item: card(), ogImage: 'x' }),
    ).toContain('class="note"');
  });

  it('"Open in app" goes through sign-in to the app route', () => {
    const page = itemPage(ctx, { deck, item: card(), ogImage: 'x' });
    expect(page).toContain('href="/sign-in?next=%2Fi%2F00000000-0000-4000-8000-000000000001"');
  });
});

describe('head tags (D177, D179)', () => {
  it('card page: article, own image, canonical = og:url, large card', () => {
    const page = itemPage(ctx, {
      deck,
      item: card(),
      ogImage: 'https://res.cloudinary.com/demo/og.jpg',
    });
    const canonical = `${ORIGIN}/p/our-street/i/00000000-0000-4000-8000-000000000001`;
    expect(page).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(meta(page, 'og:url')).toBe(canonical);
    expect(meta(page, 'og:type')).toBe('article');
    expect(meta(page, 'og:title')).toBe('Water shut-off');
    expect(meta(page, 'og:description')).toBe('The valve is behind the bins.');
    expect(meta(page, 'og:image')).toBe('https://res.cloudinary.com/demo/og.jpg');
    expect(meta(page, 'twitter:card')).toBe('summary_large_image');
    expect(page).not.toContain('name="robots"');
  });

  it('deck and category pages: website with the site image', () => {
    const page = deckPage(ctx, { deck, items: [], nextCursor: null });
    expect(meta(page, 'og:type')).toBe('website');
    expect(meta(page, 'og:image')).toBe(ctx.siteImage);
    expect(meta(page, 'og:url')).toBe(`${ORIGIN}/p/our-street`);
  });

  it('description is at most 160 characters', () => {
    const page = itemPage(ctx, { deck, item: card({ body: 'word '.repeat(100) }), ogImage: 'x' });
    expect([...meta(page, 'description')!].length).toBeLessThanOrEqual(160);
  });

  it('a title with markup is escaped in the head', () => {
    const page = itemPage(ctx, {
      deck,
      item: card({ title: '"><script>x</script>' }),
      ogImage: 'x',
    });
    expect(page).not.toContain('<script>');
    expect(meta(page, 'og:title')).toBe('&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
  });

  it('shared decks and error pages are noindex', () => {
    expect(
      deckPage({ ...ctx, robots: 'noindex' }, { deck, items: [], nextCursor: null }),
    ).toContain('<meta name="robots" content="noindex">');
    expect(notFoundPage()).toContain('<meta name="robots" content="noindex">');
  });
});
