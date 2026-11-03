import type { Browser, Page } from '@playwright/test';
import { expect, signIn, test, webUrl } from '../../fixtures/web';

/**
 * 035 analytics consent (D262–D266, `@full`). Analytics is switched on for the browser by
 * answering `/config` with a site id, and Umami's tracker is a stub that records each request
 * for `/stats/script.js` and every payload the before-send hook lets through.
 *
 * The member's stored answer is held in the page (GET `/me` patched, PUT answered from it): the
 * smoke owner is shared by every spec running in parallel, and a real "declined" would silence
 * `app-analytics.spec.ts`. The PUT itself is covered by `analytics-consent.int.test.ts`.
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

type Consent = { value: string; at: string | null; source: string | null };

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

type MemberState = { consent: Consent; puts: unknown[] };

const unanswered = (): MemberState => ({
  consent: { value: 'unanswered', at: null, source: null },
  puts: [],
});

/** Pass the same `state` to several pages to play one account on several devices. */
async function stubMember(page: Page, state: MemberState = unanswered()): Promise<MemberState> {
  await page.route('**/api/config', async (route) => {
    const res = await route.fetch();
    const config = (await res.json()) as Record<string, unknown>;
    const host = new URL(webUrl('/')).hostname;
    await route.fulfill({
      response: res,
      json: { ...config, analytics: { siteId: SITE_ID, host } },
    });
  });
  await page.route('**/api/me', async (route) => {
    const res = await route.fetch();
    const me = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...me, analyticsConsent: state.consent } });
  });
  await page.route('**/api/me/analytics-consent', async (route) => {
    const body = route.request().postDataJSON() as { value: string; source: string };
    state.puts.push(body);
    state.consent = { value: body.value, at: new Date().toISOString(), source: body.source };
    await route.fulfill({ json: state.consent });
  });
  return state;
}

const sentCount = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __analyticsSent?: unknown[] }).__analyticsSent?.length ?? 0,
  );

test('a member who says "No thanks" sends nothing and Settings shows it off @full', async ({
  page,
  webDeck,
}) => {
  const tracker = await stubTracker(page);
  const member = await stubMember(page);

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const prompt = page.getByRole('region', { name: 'Help improve Gobbit?' });
  await expect(prompt).toBeVisible();
  // Unanswered counts as allowed (D261): the deck view is already recorded.
  await expect.poll(() => sentCount(page), { timeout: 15_000 }).toBeGreaterThan(0);

  await prompt.getByRole('button', { name: 'No thanks' }).click();
  await expect(prompt).toBeHidden();
  expect(member.puts).toEqual([{ value: 'declined', source: 'prompt' }]);

  // A fresh load with the answer stored: the tracker is never requested, nothing is recorded.
  tracker.loads = 0;
  await page.goto(webUrl(`/d/${webDeck.slug}/search?q=anything`));
  await page.waitForLoadState('networkidle');
  expect(tracker.loads).toBe(0);
  expect(await sentCount(page)).toBe(0);

  await page.goto(webUrl('/settings'));
  const toggle = page.getByRole('switch', { name: 'Usage analytics' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(/^Since /)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Help improve Gobbit?' })).toHaveCount(0);
});

test('a "No thanks" from one device silences the other once it refreshes @full', async ({
  page,
  browser,
  webDeck,
}) => {
  const member = await stubMember(page);
  await stubTracker(page);
  await page.goto(webUrl(`/d/${webDeck.slug}`));
  const prompt = page.getByRole('region', { name: 'Help improve Gobbit?' });
  await prompt.getByRole('button', { name: 'No thanks' }).click();
  await expect(prompt).toBeHidden();

  // SC-002: a second device of the same account (own storage, same stored answer).
  const other = await browser.newContext({ extraHTTPHeaders: {} });
  try {
    await signIn(other);
    const second = await other.newPage();
    const tracker = await stubTracker(second);
    await stubMember(second, member);
    const me = second.waitForResponse((res) => res.url().endsWith('/api/me'));
    await second.goto(webUrl(`/d/${webDeck.slug}`));
    await me;
    await second.waitForLoadState('networkidle');
    expect(tracker.loads).toBe(0);
    expect(await sentCount(second)).toBe(0);
    await expect(second.getByRole('region', { name: 'Help improve Gobbit?' })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('Do Not Track does not switch analytics off for a member who has not answered @full', async ({
  page,
  webDeck,
}) => {
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

test('the prompt never covers the card editor @full', async ({ page, webDeck }) => {
  await stubTracker(page);
  await stubMember(page);
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Help improve Gobbit?' })).toHaveCount(0);
});

/** A visitor with no session cookie (the fixture's `page` carries the smoke session). */
async function stranger(browser: Browser, run: (page: Page) => Promise<void>): Promise<void> {
  // No project headers: in `api-smoke` a new context would inherit the owner's bearer token.
  const context = await browser.newContext({ extraHTTPHeaders: {} });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a visitor who says "No thanks" never loads the tracker again @full', async ({
  anon,
  browser,
}) => {
  const html = await (await anon.get(webUrl('/welcome'))).text();
  test.skip(!html.includes('src="/analytics/page.js"'), 'analytics is off on this server');

  await stranger(browser, async (page) => {
    const tracker = await stubTracker(page);
    await page.goto(webUrl('/welcome'));
    const banner = page.getByRole('region', { name: 'Analytics choice' });
    await expect(banner).toBeVisible();
    await expect.poll(() => tracker.loads).toBe(1);

    await banner.getByRole('button', { name: 'No thanks' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await page.waitForLoadState('load');
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toBeHidden();
    expect(tracker.loads).toBe(1);
    expect(await sentCount(page)).toBe(0);
    // SC-006: the choice lives in localStorage; nothing is stored as a cookie.
    expect(await page.context().cookies()).toEqual([]);

    // The "Analytics" button reopens the choice with the date it was made.
    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/^You said no on /)).toBeVisible();
  });
});
