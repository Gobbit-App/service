import { test, expect } from '../../fixtures/api';

test('@smoke - GET /decks includes created decks', async ({ api }) => {
  const response = await api.get('/decks');
  expect(response.status()).toBe(200);

  const data = await response.json();
  const slugs = data.data.map((pb: { slug: string }) => pb.slug);

  expect(slugs).toContain('family');
  expect(slugs).toContain('smoke');
});

test('@smoke - GET /decks/family/categories includes general', async ({ api }) => {
  const response = await api.get('/decks/family/categories');
  expect(response.status()).toBe(200);

  const data = await response.json();
  const slugs = data.data.map((cat: { slug: string }) => cat.slug);

  expect(slugs).toContain('general');
});

test('@smoke - GET /decks/family/items returns food items with cursor', async ({ api }) => {
  const response = await api.get('/decks/family/items?category=food&limit=10');
  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data.data).toHaveLength(10);
  expect(data.nextCursor).not.toBeNull();
});
