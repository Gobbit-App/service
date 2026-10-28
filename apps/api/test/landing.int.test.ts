import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { WAITLIST_JOIN_PER_EMAIL_PER_HOUR } from '@pb/shared';
import { waitlistEntries, type WaitlistEntryRow } from '@pb/db';
import { createAnonRateLimiter } from '../src/lib/anon-rate-limiter';
import { RATE_WINDOW_MS, windowStart } from '../src/lib/rate-window';
import { SESSION_COOKIE } from '../src/lib/cookies';
import { captureLogger, expectDecision } from './capture-logger';
import { OWNER_EMAIL, setupApiTest, tokenFromMail, type ApiTestContext } from './helpers';

const IP_HEADER = 'x-test-ip';
const APP_URL = 'http://app.test';
const ENV = { APP_URL, CORS_ORIGINS: APP_URL, CLIENT_IP_HEADER: IP_HEADER };

let ipSeq = 0;
const nextIp = () => `10.3.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
let emailSeq = 0;
const nextEmail = () => `lander-${++emailSeq}@example.test`;

function harness(ctx: ApiTestContext) {
  const post = (
    fields: Record<string, string>,
    { ip = nextIp(), headers = {} }: { ip?: string; headers?: Record<string, string> } = {},
  ) =>
    ctx.app.request('/welcome', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: APP_URL,
        [IP_HEADER]: ip,
        ...headers,
      },
      body: new URLSearchParams(fields).toString(),
    });
  const get = (path: string, headers: Record<string, string> = {}) =>
    ctx.app.request(path, { headers: { [IP_HEADER]: nextIp(), ...headers } });
  const entries = (email: string): Promise<WaitlistEntryRow[]> =>
    ctx.t.db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email));
  return { post, get, entries };
}

function alignWindow(ctx: ApiTestContext) {
  beforeEach(() => {
    ctx.mailer.clear();
    const at = ctx.clock.now();
    ctx.clock.advance(windowStart(at).getTime() + RATE_WINDOW_MS - at.getTime() + 1_000);
  });
  afterEach(() => ctx.clock.reset());
}

const robots = (html: string) => /<meta name="robots" content="([^"]*)">/.exec(html)?.[1];

describe('landing page GET (D226, D229, D242)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ env: ENV, logger: capture.logger });
  const { get } = harness(ctx);
  alignWindow(ctx);

  it('anonymous → 200 HTML, public cache, Vary Cookie, no cookie set', async () => {
    const res = await get('/welcome');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('Vary')).toContain('Cookie');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    const html = await res.text();
    expect(html).toContain('<form class="join" method="post" action="/welcome">');
    expect(html).toContain(`<link rel="canonical" href="${APP_URL}/">`);
    expect(html).not.toMatch(/<script/i);

    await capture.flush();
    const line = expectDecision(capture.lines, 'landing.render', { outcome: 'rendered' });
    expect(line).toMatchObject({ state: 'default', via: 'direct' });
  });

  it.each([
    ['/welcome?confirmed=1', 'confirmed', 'You&#39;re on the list'],
    ['/welcome?confirm=invalid', 'confirm_invalid', 'That link no longer works'],
    ['/welcome/joined', 'joined', 'Check your email to confirm'],
  ] as const)('%s renders the %s state', async (path, state, text) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(text);
    await capture.flush();
    expect(expectDecision(capture.lines, 'landing.render', { outcome: 'rendered' })).toMatchObject({
      state,
    });
  });

  it('records where the visit came from and a valid utm tag', async () => {
    await get('/welcome?utm_source=WhatsApp', { 'X-Gobbit-Via': 'root' });
    await capture.flush();
    expect(expectDecision(capture.lines, 'landing.render', { outcome: 'rendered' })).toMatchObject({
      via: 'root',
      utmSource: 'whatsapp',
    });

    capture.lines.length = 0;
    await get('/welcome?from=app');
    await capture.flush();
    expect(expectDecision(capture.lines, 'landing.render', { outcome: 'rendered' })).toMatchObject({
      via: 'app',
    });
  });

  it('a signed-in member gets the signed-in variant, private and uncached', async () => {
    const res = await get('/welcome', { Cookie: ctx.asCookie(OWNER_EMAIL).Cookie! });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toContain('Cookie');
    const html = await res.text();
    expect(html).toContain('<a href="/">Open Gobbit</a>');
    expect(html).not.toContain('<form');
    await capture.flush();
    expect(expectDecision(capture.lines, 'landing.render', { outcome: 'rendered' })).toMatchObject({
      state: 'signed_in',
    });
  });

  it('an expired or unknown cookie shows the anonymous page, not a 401', async () => {
    const res = await get('/welcome', { Cookie: `${SESSION_COOKIE}=not-a-session` });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<form class="join"');
  });

  it('the sitemap lists the root first', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs[0]).toBe(`${APP_URL}/`);
  });
});

describe('landing form POST (D228, D242)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ env: ENV, logger: capture.logger });
  const { post, entries } = harness(ctx);
  alignWindow(ctx);

  it('valid → 303 to /welcome/joined, one pending landing row, one mail', async () => {
    const email = nextEmail();
    const res = await post({ email, kind: 'community', note: 'our street', utm_source: 'Flyer' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/welcome/joined');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const [row] = await entries(email);
    expect(row).toMatchObject({
      status: 'pending',
      kind: 'community',
      source: 'landing',
      note: 'our street',
      utmSource: 'flyer',
    });
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.last()?.to).toBe(email);

    await capture.flush();
    expectDecision(capture.lines, 'landing.form', { outcome: 'accepted' });
    expect(JSON.stringify(capture.lines)).not.toContain(email);
  });

  it('pending, confirmed, an existing user and the honeypot all get the same 303', async () => {
    const pending = nextEmail();
    await post({ email: pending, kind: 'family' });

    const confirmed = nextEmail();
    await post({ email: confirmed, kind: 'family' });
    const token = tokenFromMail(ctx.mailer);
    await ctx.app.request(`/waitlist/confirm?token=${token}`, {
      headers: { [IP_HEADER]: nextIp() },
    });

    const honeypot = nextEmail();
    const posts: Record<string, string>[] = [
      { email: pending, kind: 'family' },
      { email: confirmed, kind: 'family' },
      { email: OWNER_EMAIL, kind: 'family' },
      { email: honeypot, kind: 'family', website: 'https://spam.example' },
    ];
    const answers = await Promise.all(
      posts.map(async (fields) => {
        const res = await post(fields);
        return [res.status, res.headers.get('Location'), await res.text()];
      }),
    );
    for (const answer of answers) expect(answer).toEqual([303, '/welcome/joined', '']);
    expect(await entries(honeypot)).toEqual([]);
  });

  it('a bad email re-renders 400 with the values, the message, private and noindex', async () => {
    const res = await post({ email: 'nope', kind: 'family', note: '<b>hi</b>' });
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const html = await res.text();
    expect(robots(html)).toBe('noindex');
    expect(html).toContain('value="nope"');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi');
    expect(html).toContain('id="email-error"');
    expect(html).toContain('value="family" required checked');
    expect(ctx.mailer.sent).toHaveLength(0);

    await capture.flush();
    expect(expectDecision(capture.lines, 'landing.form', { outcome: 'invalid' })).toMatchObject({
      fields: 'email',
    });
  });

  it('a JSON body is not a form → 400 page', async () => {
    const res = await ctx.app.request('/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [IP_HEADER]: nextIp() },
      body: JSON.stringify({ email: nextEmail(), kind: 'family' }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
  });

  it('a foreign Origin → 403 problem, nothing stored', async () => {
    const email = nextEmail();
    const res = await post({ email, kind: 'family' }, { headers: { Origin: 'https://evil.test' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toMatch(/problem\+json/);
    expect(await entries(email)).toEqual([]);
  });

  it(`the ${WAITLIST_JOIN_PER_EMAIL_PER_HOUR + 1}th join for one email → 429 page with values`, async () => {
    const email = nextEmail();
    for (let i = 0; i < WAITLIST_JOIN_PER_EMAIL_PER_HOUR; i++) {
      expect((await post({ email, kind: 'family' })).status).toBe(303);
    }
    const res = await post({ email, kind: 'family' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain(`value="${email}"`);
    expect(html).toContain('<p class="notice" role="alert">Too many tries.');

    await capture.flush();
    expectDecision(capture.lines, 'landing.form', { outcome: 'refused', reason: 'per_email' });
  });
});

describe('landing form per-IP limit (D219, D242)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    env: ENV,
    logger: capture.logger,
    waitlistLimiter: createAnonRateLimiter({ limit: 2 }),
  });
  const { post, entries } = harness(ctx);
  alignWindow(ctx);

  it('the 3rd post from one IP → 429 page with values, Retry-After, both events', async () => {
    const ip = nextIp();
    expect((await post({ email: nextEmail(), kind: 'family' }, { ip })).status).toBe(303);
    expect((await post({ email: nextEmail(), kind: 'family' }, { ip })).status).toBe(303);

    const email = nextEmail();
    const res = await post({ email, kind: 'personal' }, { ip });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    const html = await res.text();
    expect(html).toContain(`value="${email}"`);
    expect(html).toContain('<p class="notice" role="alert">');
    expect(await entries(email)).toEqual([]);

    await capture.flush();
    expectDecision(capture.lines, 'landing.form', { outcome: 'refused', reason: 'per_ip' });
    expectDecision(capture.lines, 'rate_limit.refused', { outcome: 'refused', reason: 'per_ip' });
    const logged = JSON.stringify(capture.lines);
    expect(logged).not.toContain(email);
    expect(logged).not.toContain(ip);
  });
});
