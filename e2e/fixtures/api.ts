import { randomUUID } from 'node:crypto';
import { test as base, type APIRequestContext, expect } from '@playwright/test';

export interface SmokeDeck {
  id: string;
  slug: string;
}

interface Member {
  userId: string;
  implicit: boolean;
}

/** D43/P2.7: memberships (e.g. the `smoke-invitee` invite) are removed before the deck goes. */
async function removeMembers(api: APIRequestContext, deckId: string): Promise<void> {
  const res = await api.get(`/decks/${deckId}/members`);
  if (res.status() !== 200) {
    console.warn(`smoke deck ${deckId} members lookup returned ${res.status()}`);
    return;
  }
  const { data } = (await res.json()) as { data: Member[] };
  for (const m of data.filter((member) => !member.implicit)) {
    const del = await api.delete(`/decks/${deckId}/members/${m.userId}`);
    if (del.status() !== 204) {
      console.warn(`smoke member ${m.userId} cleanup returned ${del.status()}`);
    }
  }
}

/**
 * `api` is the owner (the seeded `SMOKE_SESSION_TOKEN` bearer from the project config);
 * `anon` carries no credentials. D50: every spec works in its own `smoke-<runId>` deck,
 * created before the test and soft-deleted after it, so the deployed database is left as found.
 */
export const test = base.extend<{
  api: APIRequestContext;
  anon: APIRequestContext;
  smokeDeck: SmokeDeck;
}>({
  api: async ({ request }, use) => {
    await use(request);
  },
  anon: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: {} });
    try {
      await use(ctx);
    } finally {
      await ctx.dispose();
    }
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
      await removeMembers(request, deck.id);
      const del = await request.delete(`/decks/${deck.id}`);
      if (del.status() !== 204 && del.status() !== 404) {
        console.warn(`smoke deck ${slug} cleanup returned ${del.status()}`);
      }
    }
  },
});

export { expect };
