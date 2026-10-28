import { expect, test } from '../../fixtures/api';
import { webUrl } from '../../fixtures/web';
import { resolveE2eEnv } from '../../lib/env';

const { token, webBaseURL } = resolveE2eEnv();

/** Caddy owns the cookieless `/` rule (D226); the Vite dev server does not emulate it. */
const BEHIND_CADDY = !/:5173$/.test(webBaseURL);

const meta = (html: string, property: string) =>
  new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1];

/**
 * D226, D229 (030). GET only: this runs after every deploy and must never write a waitlist row.
 */
test('@smoke - strangers get the landing page with its preview tags and image', async ({
  anon,
}) => {
  const paths = BEHIND_CADDY ? ['/', '/welcome'] : ['/welcome'];
  for (const path of paths) {
    const res = await anon.get(webUrl(path), { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^text\/html/);
    expect(res.headers()['vary']).toMatch(/Cookie/i);
    const html = await res.text();
    expect(html).toContain('<form class="join" method="post" action="/welcome">');
    expect(html).not.toMatch(/<script/i);
    expect(meta(html, 'og:title')).toBeTruthy();
    expect(meta(html, 'og:url')).toBe(`${webBaseURL}/`);
    expect(meta(html, 'og:image')).toBe(`${webBaseURL}/og/landing.png`);
  }

  const image = await anon.get(webUrl('/og/landing.png'));
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
});

test('@smoke - a member opening / gets the app, not the landing page', async ({ playwright }) => {
  test.skip(!BEHIND_CADDY, 'the cookie rule for / lives in Caddy');
  const member = await playwright.request.newContext({
    extraHTTPHeaders: { Cookie: `gobbit_session=${token}` },
  });
  try {
    const res = await member.get(webUrl('/'), { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).not.toContain('action="/welcome"');
  } finally {
    await member.dispose();
  }
});
