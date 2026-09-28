import { test, expect, SMOKE_POCKETBOOK } from '../../fixtures/api';

test('items lifecycle @smoke', async ({ api, scratch }) => {
  const title = `smoke ${Date.now()}`;

  // Create item
  const createRes = await api.post(`/pocketbooks/${SMOKE_POCKETBOOK}/items`, {
    data: {
      type: 'text',
      title,
      body: 'hello',
    },
  });
  expect(createRes.status()).toBe(201);
  const item = await createRes.json();
  const itemId = item.id;
  scratch.track(itemId);

  // Get item
  const getRes = await api.get(`/items/${itemId}`);
  expect(getRes.status()).toBe(200);
  const fetched = await getRes.json();
  expect(fetched.title).toBe(title);

  // Update item
  const patchRes = await api.patch(`/items/${itemId}`, {
    data: { title: 'patched' },
  });
  expect(patchRes.status()).toBe(200);
  const patched = await patchRes.json();
  expect(patched.title).toBe('patched');

  // Archive item
  const archiveRes = await api.post(`/items/${itemId}/archive`, {});
  expect(archiveRes.status()).toBe(200);
  const archived = await archiveRes.json();
  expect(archived.status).toBe('archived');

  // List items (default status=published, so archived item not included)
  const listRes = await api.get(`/pocketbooks/${SMOKE_POCKETBOOK}/items`);
  expect(listRes.status()).toBe(200);
  const page = await listRes.json();
  expect(page.data.map((i: { id: string }) => i.id)).not.toContain(itemId);

  // Add to favorites
  const favRes = await api.post(`/items/${itemId}/favorite`, {});
  expect(favRes.status()).toBe(204);

  // Remove from favorites
  const unfavRes = await api.delete(`/items/${itemId}/favorite`);
  expect(unfavRes.status()).toBe(204);

  // Delete item
  const delRes = await api.delete(`/items/${itemId}`);
  expect(delRes.status()).toBe(204);

  // Verify item is gone
  const notFoundRes = await api.get(`/items/${itemId}`);
  expect(notFoundRes.status()).toBe(404);
});

test('items validation @smoke', async ({ api }) => {
  const res = await api.post(`/pocketbooks/${SMOKE_POCKETBOOK}/items`, {
    data: {
      type: 'text',
      title: 'test',
      body: 'a'.repeat(601),
    },
  });

  expect(res.status()).toBe(400);
  expect(res.headers()['content-type']).toContain('application/problem+json');

  const problem = await res.json();
  expect(problem.errors[0].path).toBe('body');
});
