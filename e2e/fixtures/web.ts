import type { APIRequestContext } from '@playwright/test';
import { resolveE2eEnv } from '../lib/env';
import { test as apiTest, expect, type SmokeDeck } from './api';

const { webBaseURL, token } = resolveE2eEnv();

/** The session cookie the API reads (`SESSION_COOKIE` in apps/api/src/lib/cookies.ts). */
const SESSION_COOKIE = 'gobbit_session';

/** Absolute URL on the web origin (the project's baseURL stays on the API for `request`). */
export function webUrl(path: string): string {
  return `${webBaseURL}${path}`;
}

export const SMOKE_CATEGORY = { name: 'Smoke chips', slug: 'smoke-chips' } as const;

/** One card of each type (D62), small enough for any payload budget. */
function cardsFor(categoryId: string): Record<string, unknown>[] {
  const categoryIds = [categoryId];
  return [
    { type: 'text', title: 'Smoke text', body: '**Bold** text with a [link](https://example.com)' },
    {
      type: 'link',
      title: 'Smoke link',
      body: 'A link without a preview image',
      payload: { url: 'https://example.com/a-very-long-path/that-should-wrap-on-small-screens' },
    },
    {
      type: 'image',
      title: 'Smoke image',
      payload: { publicId: 'samples/smoke/does-not-exist', alt: 'Smoke image' },
    },
    {
      type: 'table',
      title: 'Smoke table',
      categoryIds,
      payload: {
        columns: ['Day', 'Breakfast', 'Lunch', 'Dinner', 'Notes'],
        rows: [
          ['Monday', 'Porridge with fruit', 'Falafel and hummus', 'Fish with rice', 'Shopping'],
          ['Tuesday', 'Omelette', 'Lentil soup', 'Roast chicken', 'Swimming lessons'],
        ],
      },
    },
    {
      type: 'calc',
      title: 'Smoke calc',
      payload: {
        fields: [
          { key: 'servings', label: 'Servings', default: 4 },
          { key: 'grams', label: 'Grams per serving', unit: 'g', default: 100 },
        ],
        expression: 'servings * grams',
        resultLabel: 'Total grams',
      },
    },
  ];
}

export interface WebDeck extends SmokeDeck {
  items: { id: string; type: string; title: string }[];
}

async function seedDeck(api: APIRequestContext, deck: SmokeDeck): Promise<WebDeck> {
  const cat = await api.post(`decks/${deck.id}/categories`, { data: SMOKE_CATEGORY });
  expect(cat.status(), 'create smoke category').toBe(201);
  const { id: categoryId } = (await cat.json()) as { id: string };

  const items: WebDeck['items'] = [];
  for (const card of cardsFor(categoryId)) {
    const res = await api.post(`decks/${deck.slug}/items`, { data: card });
    expect(res.status(), `create ${String(card.type)} card`).toBe(201);
    const item = (await res.json()) as { id: string; type: string; title: string };
    items.push({ id: item.id, type: item.type, title: item.title });
  }
  return { ...deck, items };
}

/**
 * D62: the browser signs in by carrying the smoke bearer token as the session cookie (sessions
 * are looked up by token hash whatever the transport). `webDeck` is the per-test smoke deck
 * filled with one card per type. `api` carries the bearer header itself because this project's
 * `use` sets none (the page must not get it); `anon` and deck cleanup come from the API fixture.
 */
export const test = apiTest.extend<{ webDeck: WebDeck }>({
  api: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    });
    try {
      await use(ctx);
    } finally {
      await ctx.dispose();
    }
  },
  context: async ({ context }, use) => {
    if (token) {
      await context.addCookies([
        { name: SESSION_COOKIE, value: token, url: webBaseURL, httpOnly: true, sameSite: 'Lax' },
      ]);
    }
    await use(context);
  },
  webDeck: async ({ api, smokeDeck }, use) => {
    await use(await seedDeck(api, smokeDeck));
  },
});

export { expect };
