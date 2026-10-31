import type { Page } from '@playwright/test';
import { expect, test, webUrl } from '../../fixtures/web';

/**
 * 033 app analytics (D244–D248, `@full`, SC-003). `/config` is answered with analytics on and
 * Umami's tracker is replaced by a stub that runs the app's before-send hook exactly like the real
 * one (`data-before-send`, then the request) and records what would be sent. Browsing a deck,
 * searching a sentinel term and creating a card must leave only route patterns, screen names, ids
 * and fixed labels in the record.
 */

const SITE_ID = '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90';
const SENTINEL = 'zebrafinch';

/** Builds the payloads Umami v3 builds (real url and title) and keeps what the hook returns. */
const TRACKER_STUB = `
(() => {
  const script = document.currentScript;
  const hook = window[script.dataset.beforeSend];
  window.__analyticsSent = [];
  const base = () => ({
    website: script.dataset.websiteId,
    hostname: location.hostname,
    screen: screen.width + 'x' + screen.height,
    language: navigator.language,
    title: document.title,
    url: location.pathname + location.search + location.hash,
    referrer: document.referrer,
  });
  const send = (type, payload) => {
    const out = hook ? hook(type, payload) : payload;
    if (out) window.__analyticsSent.push({ type, payload: out });
  };
  window.umami = {
    track: (name, data) => send('event', name ? { ...base(), name, data } : base()),
    identify: (id) => send('identify', { ...base(), id }),
  };
})();
`;

type Sent = { type: string; payload: Record<string, unknown> };

async function stubAnalytics(page: Page): Promise<string[]> {
  const beacons: string[] = [];
  await page.route('**/api/config', async (route) => {
    const res = await route.fetch();
    const config = (await res.json()) as Record<string, unknown>;
    const host = new URL(webUrl('/')).hostname;
    await route.fulfill({
      response: res,
      json: { ...config, analytics: { siteId: SITE_ID, host } },
    });
  });
  await page.route('**/stats/script.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: TRACKER_STUB }),
  );
  await page.route('**/stats/api/send', (route) => {
    beacons.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  return beacons;
}

const sent = (page: Page) =>
  page.evaluate(() => (window as unknown as { __analyticsSent?: Sent[] }).__analyticsSent ?? []);

test('in-app analytics sends route patterns, screen names and ids only @full', async ({
  page,
  webDeck,
}) => {
  const beacons = await stubAnalytics(page);
  const title = `${SENTINEL} card ${webDeck.slug}`;

  await page.goto(webUrl(`/d/${webDeck.slug}`));
  await expect.poll(async () => (await sent(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.goto(webUrl(`/d/${webDeck.slug}/search?q=${SENTINEL}`));
  await page.goto(webUrl(`/d/${webDeck.slug}/new`));
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Body', { exact: true }).fill(`Body with ${SENTINEL}`);
  const created = page.waitForResponse(
    (res) => res.request().method() === 'POST' && /\/decks\/[^/]+\/items$/.test(res.url()),
  );
  await page.getByRole('button', { name: 'Save card' }).click();
  const item = (await (await created).json()) as { id: string; deckId: string };

  await expect
    .poll(async () => (await sent(page)).some((s) => s.payload.name === 'card-created'))
    .toBe(true);
  const record = await sent(page);

  // SC-003: no slug, title, search term or real path anywhere in what would be sent.
  const text = JSON.stringify(record);
  expect(text).not.toContain(SENTINEL);
  expect(text).not.toContain(webDeck.slug);
  for (const { payload } of record) {
    expect(String(payload.url)).toMatch(/^\/[a-z:/-]*$/);
    expect(payload.website).toBe(SITE_ID);
    expect(payload.id).toMatch(/^[0-9a-f-]{36}$/);
  }
  expect(record.map((s) => s.payload.url)).toEqual(
    expect.arrayContaining(['/d/:deck', '/d/:deck/search', '/d/:deck/new']),
  );

  const event = record.find((s) => s.payload.name === 'card-created');
  expect(event?.payload.data).toEqual({
    deckId: item.deckId,
    itemId: item.id,
    type: 'text',
    channel: 'editor',
  });
  expect(beacons).toEqual([]); // the stub never sends; nothing reached the real collector
});
