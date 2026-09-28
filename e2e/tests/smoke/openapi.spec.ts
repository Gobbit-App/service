import { test, expect } from '../../fixtures/api';

test('openapi.json lists core paths @smoke', async ({ api }) => {
  const response = await api.get('/openapi.json');

  expect(response.status()).toBe(200);

  const json = await response.json();

  expect(json.paths['/pocketbooks']).toBeDefined();
  expect(json.paths['/items/{id}']).toBeDefined();
});
