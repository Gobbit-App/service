import { test, expect } from '../../fixtures/identity';

test('requests without credentials get 401 problem+json @smoke', async ({ anon }) => {
  const response = await anon.get('decks');

  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  expect((await response.json()).status).toBe(401);
});

test('a garbage bearer is 401 @smoke', async ({ anon }) => {
  const response = await anon.get('me', {
    headers: { Authorization: 'Bearer not-a-real-session-token' },
  });
  expect(response.status()).toBe(401);
  expect((await response.json()).type).toBe('/problems/session-invalid');
});

test('a signed-in session answers /me @smoke', async ({ api }) => {
  const response = await api.get('me');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(typeof body.user.email).toBe('string');
  expect(Array.isArray(body.decks)).toBe(true);
});
