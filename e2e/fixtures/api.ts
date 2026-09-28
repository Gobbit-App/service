import { test as base, type APIRequestContext, expect } from '@playwright/test';

export const test = base.extend<{
  api: APIRequestContext;
  scratch: { track(itemId: string): void };
}>({
  api: async ({ request }, use) => {
    await use(request);
  },
  scratch: async ({ request }, use) => {
    const ids: string[] = [];
    await use({ track: (id) => ids.push(id) });
    for (const id of ids) {
      await request.delete(`/items/${id}`).catch(() => {
        // Ignore failures (404s)
      });
    }
  },
});

export { expect };
export const SMOKE_POCKETBOOK = 'smoke';
