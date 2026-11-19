import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import type { PlaywrightWorkerArgs } from '@playwright/test';
import { waitForCallbackLink } from '../lib/mailbox';
import { EMAIL_DOMAIN } from '../lib/stack-config';
import { stack } from '../lib/stack';

type Playwright = PlaywrightWorkerArgs['playwright'];

export interface Identity {
  email: string;
  userId: string;
  /** Cookie session, own cookie jar. */
  api: APIRequestContext;
  /** Own browser context carrying the same session. */
  context: BrowserContext;
  /** A new page in `context`. */
  page(): Promise<Page>;
}

/** A request context on the API; writes carry the web origin (the CSRF middleware, D32). */
export const newApiContext = (playwright: Playwright): Promise<APIRequestContext> =>
  playwright.request.newContext({
    baseURL: `${stack.apiUrl}/`,
    extraHTTPHeaders: { Origin: stack.webUrl },
  });

/** Signs `email` in through the real magic link (mail read from the mailbox); returns the signed-in jar. */
export async function signInByMagicLink(
  playwright: Playwright,
  email: string,
): Promise<{ api: APIRequestContext; userId: string }> {
  const api = await newApiContext(playwright);
  try {
    const req = await api.post('auth/magic-link', { data: { email } });
    expect(req.status(), `magic link for ${email}`).toBe(200);
    const link = await waitForCallbackLink(stack.mailboxUrl, email);
    // The cookie is set on the 303; the redirect target (the web app) is not needed.
    const cb = await api.get(link, { maxRedirects: 0 });
    expect(cb.status(), 'magic link callback').toBe(303);
    const me = await api.get('me');
    expect(me.status(), 'GET /me after sign-in').toBe(200);
    const { user } = (await me.json()) as { user: { id: string } };
    return { api, userId: user.id };
  } catch (err) {
    await api.dispose();
    throw err;
  }
}

/** A fresh `<tag>-<8 random>@example.test` user, signed in with its own API and browser contexts. */
export async function createIdentity(
  playwright: Playwright,
  browser: Browser,
  tag = 'user',
): Promise<Identity> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const { api, userId } = await signInByMagicLink(playwright, email);
  const context = await browser.newContext({
    baseURL: stack.webUrl,
    storageState: await api.storageState(),
  });
  return { email, userId, api, context, page: () => context.newPage() };
}

export interface SmokeDeck {
  id: string;
  slug: string;
}

export const SMOKE_CATEGORY = { name: 'Smoke chips', slug: 'smoke-chips' } as const;

/**
 * One card of each type (D62), small enough for any payload budget. No image card: an image must
 * reference an asset recorded for its deck (D160); editor.spec.ts covers the image journey.
 */
function cardsFor(categoryId: string): Record<string, unknown>[] {
  return [
    { type: 'text', title: 'Smoke text', body: '**Bold** text with a [link](https://example.com)' },
    {
      type: 'link',
      title: 'Smoke link',
      body: 'A link without a preview image',
      payload: { url: 'https://example.com/a-very-long-path/that-should-wrap-on-small-screens' },
    },
    {
      type: 'table',
      title: 'Smoke table',
      categoryIds: [categoryId],
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

/** Invitable roles (`memberRoles` in @gobbit/shared minus the owner, which is never invited). */
export type InviteRole = 'maintainer' | 'editor' | 'reader';

/**
 * A new address invited by `owner` with `role` (POST /decks/{id}/invites). The invitee follows the
 * invite mail's `/auth/callback` link in its own cookie jar, which signs it in and accepts the invite.
 */
export async function createMember(
  playwright: Playwright,
  browser: Browser,
  owner: APIRequestContext,
  deck: { id: string },
  role: InviteRole,
): Promise<Identity> {
  const email = `${role}-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
  const invite = await owner.post(`decks/${deck.id}/invites`, { data: { email, role } });
  expect(invite.status(), `invite ${email} as ${role}`).toBe(201);
  const api = await newApiContext(playwright);
  try {
    const link = await waitForCallbackLink(stack.mailboxUrl, email);
    const cb = await api.get(link, { maxRedirects: 0 });
    expect(cb.status(), 'invite link callback').toBe(303);
    const me = await api.get('me');
    expect(me.status(), 'GET /me after accepting the invite').toBe(200);
    const { user } = (await me.json()) as { user: { id: string } };
    const context = await browser.newContext({
      baseURL: stack.webUrl,
      storageState: await api.storageState(),
    });
    return { email, userId: user.id, api, context, page: () => context.newPage() };
  } catch (err) {
    await api.dispose();
    throw err;
  }
}

async function close(identity: Identity): Promise<void> {
  await identity.context.close();
  await identity.api.dispose();
}

export const test = base.extend<{
  user: Identity;
  api: APIRequestContext;
  anon: APIRequestContext;
  newUser: (tag?: string) => Promise<Identity>;
  member: (deck: { id: string }, role: InviteRole) => Promise<Identity>;
  smokeDeck: SmokeDeck;
  webDeck: WebDeck;
}>({
  user: async ({ playwright, browser }, use) => {
    const identity = await createIdentity(playwright, browser);
    await use(identity);
    await close(identity);
  },
  api: async ({ user }, use) => {
    await use(user.api);
  },
  anon: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: `${stack.apiUrl}/` });
    await use(ctx);
    await ctx.dispose();
  },
  // The browser context of `user`, so `page` acts as the owner.
  context: async ({ user }, use) => {
    await use(user.context);
  },
  // No cleanup: the stack is thrown away.
  smokeDeck: async ({ api }, use) => {
    const slug = `smoke-${randomUUID().slice(0, 8)}`;
    const res = await api.post('decks', { data: { name: `Smoke ${slug}`, slug, kind: 'shared' } });
    expect(res.status(), `create ${slug}`).toBe(201);
    const deck = (await res.json()) as SmokeDeck;
    await use({ id: deck.id, slug: deck.slug });
  },
  webDeck: async ({ api, smokeDeck }, use) => {
    const cat = await api.post(`decks/${smokeDeck.id}/categories`, { data: SMOKE_CATEGORY });
    expect(cat.status(), 'create smoke category').toBe(201);
    const { id: categoryId } = (await cat.json()) as { id: string };
    const items: WebDeck['items'] = [];
    for (const card of cardsFor(categoryId)) {
      const res = await api.post(`decks/${smokeDeck.slug}/items`, { data: card });
      expect(res.status(), `create ${String(card.type)} card`).toBe(201);
      const item = (await res.json()) as { id: string; type: string; title: string };
      items.push({ id: item.id, type: item.type, title: item.title });
    }
    await use({ ...smokeDeck, items });
  },
  member: async ({ playwright, browser, api }, use) => {
    const made: Identity[] = [];
    await use(async (deck, role) => {
      const identity = await createMember(playwright, browser, api, deck, role);
      made.push(identity);
      return identity;
    });
    await Promise.all(made.map(close));
  },
  newUser: async ({ playwright, browser }, use) => {
    const made: Identity[] = [];
    await use(async (tag) => {
      const identity = await createIdentity(playwright, browser, tag);
      made.push(identity);
      return identity;
    });
    await Promise.all(made.map(close));
  },
});

export { expect };
