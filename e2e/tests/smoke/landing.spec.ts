import { expect, test } from '../../fixtures/identity';
import { stack, webUrl } from '../../lib/stack';

const webBaseURL = stack.webUrl;

const meta = (html: string, property: string) =>
  new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1];

/**
 * D232, D265 (031, 035): the one script a landing page may carry, when `ANALYTICS_SITE_ID` is set —
 * the first-party consent loader, which injects `/stats/script.js` only when not declined.
 */
const TRACKER =
  /^<script defer src="\/analytics\/page\.js" data-website-id="[0-9a-f-]{36}" data-domains="[^"]+">$/;
const otherScripts = (html: string) =>
  (html.match(/<script\b[^>]*>/gi) ?? []).filter((tag) => !TRACKER.test(tag));
const hasTracker = (html: string) => html.includes('src="/analytics/page.js"');

/**
 * D226, D229 (030). GET only: this runs after every deploy and must never write a waitlist row.
 */
test('@smoke - strangers get the landing page with its preview tags and image', async ({
  anon,
}) => {
  for (const path of ['/', '/welcome']) {
    const res = await anon.get(webUrl(path), { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^text\/html/);
    expect(res.headers()['vary']).toMatch(/Cookie/i);
    const html = await res.text();
    expect(html).toContain('<form class="join" method="post" action="/welcome">');
    expect(otherScripts(html), path).toEqual([]);
    expect(meta(html, 'og:title')).toBeTruthy();
    expect(meta(html, 'og:url')).toBe(`${webBaseURL}/`);
    expect(meta(html, 'og:image')).toBe(`${webBaseURL}/og/landing.png`);
  }

  const image = await anon.get(webUrl('/og/landing.png'));
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
});

test('@smoke - a member opening / gets the app, not the landing page', async ({ api }) => {
  const res = await api.get(webUrl('/'), { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<div id="root">');
  expect(html).not.toContain('action="/welcome"');
});

/**
 * D232 (031): when analytics is configured the tracker loads from the same origin under the CSP;
 * when not (PR CI) the page has no tag. The browser allows it on the device (opt-in, D281) and
 * opts out of Umami itself, so smoke is never counted.
 */
test('@smoke - the landing tracker is same-origin and allowed by the CSP, or absent', async ({
  anon,
  browser,
}) => {
  const res = await anon.get(webUrl('/welcome'));
  const html = await res.text();
  if (!hasTracker(html)) {
    expect(html).not.toContain('/stats/');
    expect(html).not.toContain('data-consent-banner');
    return;
  }

  const script = await anon.get(webUrl('/stats/script.js'));
  expect(script.status()).toBe(200);
  expect(script.headers()['content-type']).toMatch(/javascript/);

  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      window.localStorage.setItem('umami.disabled', '1');
      window.localStorage.setItem(
        'gobbit.analytics.consent',
        JSON.stringify({ value: 'allowed', at: new Date().toISOString() }),
      );
    });
    const page = await context.newPage();
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
        cspErrors.push(msg.text());
      }
    });
    const tracker = page.waitForResponse((r) => r.url().endsWith('/stats/script.js'));
    await page.goto(webUrl('/welcome'));
    expect((await tracker).status()).toBe(200);
    await page.waitForLoadState('load');
    expect(cspErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
