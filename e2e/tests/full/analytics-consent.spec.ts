import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test, type Identity } from '../../fixtures/identity';
import { stack, webUrl } from '../../lib/stack';

/**
 * 035 analytics consent (D262–D266, opt-in wall D281, `@full`). Analytics is switched on by
 * answering `/config` with a site id, and Umami's tracker is a stub that records each request
 * for `/stats/script.js` and every payload the before-send hook lets through.
 *
 * Every test has its own member, so the answers are real: the page's PUTs are recorded and the API
 * keeps the answer (a second device of the same account reads it back).
 */

const SITE_ID = '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90';

const TRACKER_STUB = `
(() => {
  const script = document.currentScript;
  const hook = window[script.dataset.beforeSend];
  window.__analyticsSent = window.__analyticsSent || [];
  const send = (type, payload) => {
    const out = hook ? hook(type, payload) : payload;
    if (out) window.__analyticsSent.push({ type, payload: out });
  };
  const base = () => ({ website: script.dataset.websiteId, hostname: location.hostname,
    url: location.pathname, title: document.title, referrer: document.referrer });
  window.umami = {
    track: (name, data) => send('event', name ? { ...base(), name, data } : base()),
    identify: (id) => send('identify', { ...base(), id }),
  };
})();
`;

/** Counts tracker loads; never lets a beacon reach the real collector. */
async function stubTracker(page: Page): Promise<{ loads: number }> {
  const counter = { loads: 0 };
  await page.route('**/stats/script.js', (route) => {
    counter.loads += 1;
    return route.fulfill({ contentType: 'text/javascript', body: TRACKER_STUB });
  });
  await page.route('**/stats/api/send', (route) => route.fulfill({ status: 204 }));
  return counter;
}

type Puts = { value: string; source: string }[];

/** Answers `/config` with analytics on and records the consent PUTs the page makes. */
async function stubMember(page: Page): Promise<Puts> {
  const puts: Puts = [];
  await page.route('**/api/config', async (route) => {
    const res = await route.fetch();
    const config = (await res.json()) as Record<string, unknown>;
    const host = new URL(webUrl('/')).hostname;
    await route.fulfill({
      response: res,
      json: { ...config, analytics: { siteId: SITE_ID, host } },
    });
  });
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().endsWith('/api/me/analytics-consent'))
      puts.push(req.postDataJSON() as Puts[number]);
  });
  return puts;
}

const allow = async (api: APIRequestContext) =>
  expect(
    (
      await api.put('me/analytics-consent', { data: { value: 'allowed', source: 'prompt' } })
    ).status(),
    'record Allow',
  ).toBe(200);

const sentCount = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __analyticsSent?: unknown[] }).__analyticsSent?.length ?? 0,
  );

const QUESTION = 'Help improve Gobbit?';

/** A member who has not answered (the fixture answers by default), with a deck of their own and a page on it. */
async function unansweredMember(
  newUser: (tag?: string, opts?: { consent?: 'unanswered' }) => Promise<Identity>,
) {
  const u = await newUser('consent', { consent: 'unanswered' });
  const res = await u.api.post('decks', {
    data: { name: 'Consent', slug: `consent-${u.userId.slice(0, 8)}`, kind: 'shared' },
  });
  expect(res.status(), 'create deck').toBe(201);
  const webDeck = (await res.json()) as { slug: string };
  return { page: await u.page(), webDeck };
}

test('an unanswered member sends nothing; "No thanks" keeps it off and Settings shows it @full', async ({
  newUser,
}) => {
  const { page, webDeck } = await unansweredMember(newUser);
  const tracker = await stubTracker(page);
  const puts = await stubMember(page);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const prompt = page.getByRole('dialog', { name: QUESTION });
  await expect(prompt).toBeVisible();
  // Opt-in (D281): nothing loads before the answer, and Escape doesn't skip the question.
  await page.waitForLoadState('networkidle');
  expect(tracker.loads).toBe(0);
  await page.keyboard.press('Escape');
  await expect(prompt).toBeVisible();

  await prompt.getByRole('button', { name: 'No thanks' }).click();
  await expect(prompt).toBeHidden();
  expect(puts).toEqual([{ value: 'declined', source: 'prompt' }]);

  await page.goto(webUrl(`/d/${webDeck.slug}/search?q=anything`));
  await page.waitForLoadState('networkidle');
  expect(tracker.loads).toBe(0);
  expect(await sentCount(page)).toBe(0);

  await page.goto(webUrl('/settings'));
  const toggle = page.getByRole('switch', { name: 'Usage analytics' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(/^Since /)).toBeVisible();
  await expect(page.getByRole('dialog', { name: QUESTION })).toHaveCount(0);
});

test('"Allow" on the wall starts counting without a reload @full', async ({ newUser }) => {
  const { page, webDeck } = await unansweredMember(newUser);
  const tracker = await stubTracker(page);
  const puts = await stubMember(page);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const prompt = page.getByRole('dialog', { name: QUESTION });
  await prompt.getByRole('button', { name: 'Allow' }).click();
  await expect(prompt).toBeHidden();
  expect(puts).toEqual([{ value: 'allowed', source: 'prompt' }]);
  await expect.poll(() => sentCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(tracker.loads).toBe(1);
});

test('a "No thanks" from one device silences the other once it refreshes @full', async ({
  page,
  api,
  user,
  browser,
  webDeck,
}) => {
  await allow(api);
  const puts = await stubMember(page);
  await stubTracker(page);
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect.poll(() => sentCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.goto(webUrl('/settings'));
  await page.getByRole('switch', { name: 'Usage analytics' }).click();
  await expect.poll(() => puts).toEqual([{ value: 'declined', source: 'settings' }]);

  // SC-002: a second device of the same account (own storage, same stored answer).
  const other = await browser.newContext({
    baseURL: stack.webUrl,
    storageState: await user.api.storageState(),
  });
  try {
    const second = await other.newPage();
    const tracker = await stubTracker(second);
    await stubMember(second);
    const me = second.waitForResponse((res) => res.url().endsWith('/api/me'));
    await second.goto(webUrl(`/d/${webDeck.slug}`));
    await me;
    await second.waitForLoadState('networkidle');
    expect(tracker.loads).toBe(0);
    expect(await sentCount(second)).toBe(0);
    await expect(second.getByRole('dialog', { name: QUESTION })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('Do Not Track does not switch analytics off for a member who allowed it @full', async ({
  page,
  api,
  webDeck,
}) => {
  await allow(api);
  // SC-001: the browser says DNT, consent decides (D261).
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' });
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
  });
  const tracker = await stubTracker(page);
  await stubMember(page);
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  expect(await page.evaluate(() => navigator.doNotTrack)).toBe('1');
  await expect.poll(() => sentCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(tracker.loads).toBe(1);
});

test('the prompt never covers the card editor @full', async ({ newUser }) => {
  const { page, webDeck } = await unansweredMember(newUser);
  const tracker = await stubTracker(page);
  await stubMember(page);
  await page.goto(webUrl(`/d/${webDeck.slug}/new?type=text`));
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: QUESTION })).toHaveCount(0);
  expect(tracker.loads).toBe(0);
});

/** A visitor with no session cookie (the landing renders its banner: the stack sets `ANALYTICS_SITE_ID`). */
async function stranger(browser: Browser, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext();
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a visitor is asked before anything loads; "No thanks" sticks @full', async ({ browser }) => {
  await stranger(browser, async (page) => {
    const tracker = await stubTracker(page);
    await page.goto(webUrl('/welcome'));
    const banner = page.getByRole('dialog', { name: 'Analytics choice' });
    await expect(banner).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(tracker.loads).toBe(0);
    await page.keyboard.press('Escape');
    await expect(banner).toBeVisible();

    await banner.getByRole('button', { name: 'No thanks' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(banner).toBeHidden();
    expect(tracker.loads).toBe(0);
    expect(await sentCount(page)).toBe(0);
    // SC-006: the choice lives in localStorage; nothing is stored as a cookie.
    expect(await page.context().cookies()).toEqual([]);

    // The "Analytics" button reopens the choice with the date it was made.
    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/^You said no on /)).toBeVisible();
  });
});

test('a visitor "Allow" loads the tracker at once @full', async ({ browser }) => {
  await stranger(browser, async (page) => {
    const tracker = await stubTracker(page);
    await page.goto(webUrl('/welcome'));
    const banner = page.getByRole('dialog', { name: 'Analytics choice' });
    await banner.getByRole('button', { name: 'Allow' }).click();
    await expect(banner).toBeHidden();
    await expect.poll(() => tracker.loads).toBe(1);
  });
});
