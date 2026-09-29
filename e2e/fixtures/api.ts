import { randomUUID } from 'node:crypto';
import { test as base, type APIRequestContext, expect } from '@playwright/test';

export interface SmokeDeck {
  id: string;
  slug: string;
}

/**
 * D50: every spec works in its own `smoke-<runId>` deck, created before the test and
 * soft-deleted after it, so the deployed database is left as it was found.
 */
export const test = base.extend<{ api: APIRequestContext; smokeDeck: SmokeDeck }>({
  api: async ({ request }, use) => {
    await use(request);
  },
  smokeDeck: async ({ request }, use) => {
    const slug = `smoke-${randomUUID().slice(0, 8)}`;
    const res = await request.post('/decks', {
      data: { name: `Smoke ${slug}`, slug, kind: 'shared' },
    });
    expect(res.status(), `create ${slug}`).toBe(201);
    const deck = (await res.json()) as SmokeDeck;
    try {
      await use({ id: deck.id, slug: deck.slug });
    } finally {
      const del = await request.delete(`/decks/${deck.id}`);
      if (del.status() !== 204 && del.status() !== 404) {
        console.warn(`smoke deck ${slug} cleanup returned ${del.status()}`);
      }
    }
  },
});

export { expect };
