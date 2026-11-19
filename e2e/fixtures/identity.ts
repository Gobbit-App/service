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

async function close(identity: Identity): Promise<void> {
  await identity.context.close();
  await identity.api.dispose();
}

export const test = base.extend<{
  user: Identity;
  api: APIRequestContext;
  anon: APIRequestContext;
  newUser: (tag?: string) => Promise<Identity>;
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
