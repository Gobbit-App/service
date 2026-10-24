import { test, expect } from '../../fixtures/api';
import { test as webTest, webUrl } from '../../fixtures/web';
import { resolveE2eEnv } from '../../lib/env';

/** D174, D176: an owner makes a deck and one category public; strangers read only that. */
test('@smoke - strangers read a public deck and nothing beyond its public categories', async ({
  api,
  anon,
  smokeDeck,
}) => {
  const createCategory = async (name: string) => {
    const res = await api.post(`decks/${smokeDeck.slug}/categories`, { data: { name } });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: string; slug: string };
  };
  const createCard = async (title: string, categoryId: string) => {
    const res = await api.post(`decks/${smokeDeck.slug}/items`, {
      data: { type: 'text', title, body: 'smoke', payload: {}, categoryIds: [categoryId] },
    });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: string };
  };

  const open = await createCategory('Smoke public');
  const closed = await createCategory('Smoke shared');
  const publicCard = await createCard('Public smoke card', open.id);
  const sharedCard = await createCard('Shared smoke card', closed.id);

  // Not public yet → the one 404.
  expect((await anon.get(`public/${smokeDeck.slug}`)).status()).toBe(404);

  const made = await api.patch(`decks/${smokeDeck.slug}/categories/${open.id}`, {
    data: { visibility: 'public' },
  });
  expect(made.status()).toBe(200);
  expect((await api.patch(`decks/${smokeDeck.slug}`, { data: { isPublic: true } })).status()).toBe(
    200,
  );

  const summary = await anon.get(`public/${smokeDeck.slug}`);
  expect(summary.status()).toBe(200);
  expect(summary.headers()['cache-control']).toBe('public, max-age=60');
  expect((await summary.json()).categories).toEqual([
    { slug: open.slug, name: 'Smoke public', itemCount: 1 },
  ]);

  const list = await anon.get(`public/${smokeDeck.slug}/items`);
  expect(list.status()).toBe(200);
  const ids = (await list.json()).data.map((i: { id: string }) => i.id);
  expect(ids).toEqual([publicCard.id]);

  const card = await anon.get(`public/${smokeDeck.slug}/items/${publicCard.id}`);
  expect(card.status()).toBe(200);
  const body = await card.json();
  expect(body.title).toBe('Public smoke card');
  expect(body).not.toHaveProperty('createdBy');

  expect((await anon.get(`public/${smokeDeck.slug}/items/${sharedCard.id}`)).status()).toBe(404);
});

/** D177, D178: strangers get a server-rendered card page; members are sent to the app. */
webTest(
  '@smoke - a public card page renders for strangers and redirects members',
  async ({ api, anon, playwright, webDeck }) => {
    const publicCard = webDeck.items.find((i) => i.type === 'table');
    const sharedCard = webDeck.items.find((i) => i.type === 'text');
    if (!publicCard || !sharedCard) throw new Error('smoke deck is missing its cards');

    const cats = await api.get(`decks/${webDeck.slug}/categories`);
    const chips = ((await cats.json()).data as { id: string; slug: string }[]).find(
      (c) => c.slug === 'smoke-chips',
    );
    if (!chips) throw new Error('smoke deck has no smoke-chips category');
    const madePublic = await api.patch(`decks/${webDeck.slug}/categories/${chips.id}`, {
      data: { visibility: 'public' },
    });
    expect(madePublic.status()).toBe(200);
    const published = await api.patch(`decks/${webDeck.slug}`, { data: { isPublic: true } });
    expect(published.status()).toBe(200);

    const cardPath = `/p/${webDeck.slug}/i/${publicCard.id}`;
    const page = await anon.get(webUrl(cardPath), { maxRedirects: 0 });
    expect(page.status()).toBe(200);
    expect(page.headers()['content-type']).toMatch(/^text\/html/);
    const html = await page.text();
    expect(html).toContain('<meta property="og:title" content="Smoke table">');
    expect(html).toContain('Porridge with fruit');
    expect(html).not.toMatch(/<script/i);

    const deckPage = await (await anon.get(webUrl(`/p/${webDeck.slug}`))).text();
    expect(deckPage).toContain('Smoke table');
    expect(deckPage).not.toContain(sharedCard.title);

    const { token } = resolveE2eEnv();
    const member = await playwright.request.newContext({
      extraHTTPHeaders: { Cookie: `gobbit_session=${token}` },
    });
    try {
      const res = await member.get(webUrl(cardPath), { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(res.headers()['location']).toBe(`/i/${publicCard.id}`);
      expect(res.headers()['cache-control']).toBe('private, no-store');
    } finally {
      await member.dispose();
    }
  },
);
