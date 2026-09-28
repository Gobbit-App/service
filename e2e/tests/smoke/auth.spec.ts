import { test, expect } from '@playwright/test';

// The project config injects dev credentials into every request; strip them here.
test.use({ extraHTTPHeaders: {} });

test('requests without dev credentials get 401 problem+json @smoke', async ({ request }) => {
  const response = await request.get('/pocketbooks');

  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/problem+json');

  const body = await response.json();
  expect(body.status).toBe(401);
});
