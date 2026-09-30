import { test, expect } from '../../fixtures/api';

test('@smoke - a new deck is listed and gets the general category', async ({ api, smokeDeck }) => {
  const list = await api.get('/decks');
  expect(list.status()).toBe(200);
  const slugs = (await list.json()).data.map((d: { slug: string }) => d.slug);
  expect(slugs).toContain(smokeDeck.slug);

  const cats = await api.get(`/decks/${smokeDeck.slug}/categories`);
  expect(cats.status()).toBe(200);
  const catSlugs = (await cats.json()).data.map((c: { slug: string }) => c.slug);
  expect(catSlugs).toEqual(['general']);
});

test('@smoke - DELETE /decks/:id hides the deck', async ({ api }) => {
  const slug = `smoke-del-${Date.now()}`;
  const created = await api.post('/decks', { data: { name: slug, slug, kind: 'shared' } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  expect((await api.delete(`/decks/${id}`)).status()).toBe(204);
  expect((await api.get(`/decks/${id}`)).status()).toBe(404);
});

test('@smoke - unknown deck is a problem+json 404', async ({ api }) => {
  const res = await api.get('/decks/does-not-exist-smoke');
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toContain('application/problem+json');
});
