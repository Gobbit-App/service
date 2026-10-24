import { test, expect } from '../../fixtures/api';

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
