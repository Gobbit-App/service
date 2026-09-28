import { test, expect } from '../../fixtures/api';

test('@smoke - GET /pocketbooks includes created pocketbooks', async ({ api }) => {
  const response = await api.get('/pocketbooks');
  expect(response.status()).toBe(200);

  const data = await response.json();
  const slugs = data.data.map((pb: { slug: string }) => pb.slug);

  expect(slugs).toContain('family');
  expect(slugs).toContain('smoke');
});

test('@smoke - GET /pocketbooks/family/categories includes general', async ({ api }) => {
  const response = await api.get('/pocketbooks/family/categories');
  expect(response.status()).toBe(200);

  const data = await response.json();
  const slugs = data.data.map((cat: { slug: string }) => cat.slug);

  expect(slugs).toContain('general');
});

test('@smoke - GET /pocketbooks/family/items returns food items with cursor', async ({ api }) => {
  const response = await api.get('/pocketbooks/family/items?category=food&limit=10');
  expect(response.status()).toBe(200);

  const data = await response.json();
  expect(data.data).toHaveLength(10);
  expect(data.nextCursor).not.toBeNull();
});
