import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/tokens';
import { SESSION_COOKIE } from '../src/lib/cookies';
import {
  json,
  OWNER_EMAIL,
  sessionTokenFromSetCookie,
  setupApiTest,
  TEST_API_URL,
  tokenFromMail,
  type ApiTestContext,
} from './helpers';

const MINUTE_MS = 60_000;
const APP_URL = 'http://app.test';

let ipSeq = 0;
/** A fresh client IP per test so the per-IP limits never interfere (they have their own suite). */
const nextIp = () => `10.0.0.${++ipSeq}`;

function authClient(ctx: ApiTestContext) {
  let ip = nextIp();
  return {
    rotateIp: () => {
      ip = nextIp();
    },
    requestLink: (email: string) =>
      ctx.app.request('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-ip': ip },
        body: JSON.stringify({ email }),
      }),
    callback: (token: string) =>
      ctx.app.request(`/auth/callback?token=${encodeURIComponent(token)}`, {
        headers: { 'x-test-ip': ip },
      }),
  };
}

describe('magic links without APP_URL (P2.2, D22–D26)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: 'x-test-ip' } });
  let client: ReturnType<typeof authClient>;

  beforeEach(() => {
    client = authClient(ctx);
    ctx.mailer.clear();
  });
  afterEach(() => ctx.clock.reset());

  it('a fresh address gets one link under API_URL that signs in and creates the user', async () => {
    const res = await client.requestLink('New.Person@Example.test');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });

    expect(ctx.mailer.sent).toHaveLength(1);
    const mail = ctx.mailer.sent[0];
    expect(mail.to).toBe('new.person@example.test');
    expect(mail.text).toContain(`${TEST_API_URL}/auth/callback?token=`);

    const cb = await client.callback(tokenFromMail(ctx.mailer));
    expect(cb.status).toBe(303);
    expect(cb.headers.get('Location')).toBe(`${TEST_API_URL}/me`);
    const setCookie = cb.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const session = sessionTokenFromSetCookie(cb)!;
    const me = await ctx.app.request('/me', {
      headers: { Cookie: `${SESSION_COOKIE}=${session}` },
    });
    expect(me.status).toBe(200);
    const body = await json(me);
    expect(body.user.email).toBe('new.person@example.test');
    expect(body.user.displayName).toBe('new.person');
    expect(body.decks).toEqual([]);

    const { rows } = await ctx.t.pool.query(
      'SELECT a.id FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.email = $1',
      ['new.person@example.test'],
    );
    expect(rows).toHaveLength(1);
  });

  it('stores only the token hash and marks the link used atomically', async () => {
    await client.requestLink('hash-check@example.test');
    const token = tokenFromMail(ctx.mailer);

    const before = await ctx.t.pool.query(
      'SELECT token_hash, used_at FROM magic_links WHERE email = $1',
      ['hash-check@example.test'],
    );
    expect(before.rows[0].token_hash).toBe(hashToken(token));
    expect(before.rows[0].token_hash).not.toContain(token);
    expect(before.rows[0].used_at).toBeNull();

    await client.callback(token);
    const after = await ctx.t.pool.query('SELECT used_at FROM magic_links WHERE email = $1', [
      'hash-check@example.test',
    ]);
    expect(after.rows[0].used_at).not.toBeNull();
  });

  it('a used link is refused with magic-link-invalid (used)', async () => {
    await client.requestLink('twice@example.test');
    const token = tokenFromMail(ctx.mailer);
    expect((await client.callback(token)).status).toBe(303);

    const again = await client.callback(token);
    expect(again.status).toBe(401);
    const body = await json(again);
    expect(body.type).toBe('/problems/magic-link-invalid');
    expect(body.detail).toBe('The sign-in link is used');
  });

  it('an unused link past its TTL is expired', async () => {
    await client.requestLink('late@example.test');
    const token = tokenFromMail(ctx.mailer);
    ctx.clock.advance(16 * MINUTE_MS);

    const body = await json(await client.callback(token));
    expect(body.detail).toBe('The sign-in link is expired');
  });

  it('a tampered token is invalid', async () => {
    await client.requestLink('tamper@example.test');
    const token = tokenFromMail(ctx.mailer);
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);

    const body = await json(await client.callback(tampered));
    expect(body.detail).toBe('The sign-in link is invalid');
  });

  it('an existing user gets a link and nothing new is created', async () => {
    const count = async () =>
      Number((await ctx.t.pool.query('SELECT count(*) FROM users')).rows[0].count);
    const before = await count();

    expect((await client.requestLink(OWNER_EMAIL)).status).toBe(200);
    expect(ctx.mailer.sent).toHaveLength(1);
    const cb = await client.callback(tokenFromMail(ctx.mailer));
    expect(cb.status).toBe(303);

    expect(await count()).toBe(before);
  });

  it('two concurrent callbacks of one link produce exactly one session', async () => {
    await client.requestLink('race@example.test');
    const token = tokenFromMail(ctx.mailer);

    const results = await Promise.all([client.callback(token), client.callback(token)]);
    const withCookie = results.filter((r) => sessionTokenFromSetCookie(r) !== null);
    expect(withCookie).toHaveLength(1);
    expect(results.map((r) => r.status).sort()).toEqual([303, 401]);
  });

  it('a malformed email is a 400 validation problem', async () => {
    const res = await client.requestLink('not-an-email');
    expect(res.status).toBe(400);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('a missing token is a 400', async () => {
    const res = await ctx.app.request('/auth/callback');
    expect(res.status).toBe(400);
  });
});

describe('magic links with APP_URL (D26 redirects)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: 'x-test-ip', APP_URL } });
  let client: ReturnType<typeof authClient>;

  beforeEach(() => {
    client = authClient(ctx);
    ctx.mailer.clear();
  });

  it('success redirects to the web app root', async () => {
    await client.requestLink('web@example.test');
    const cb = await client.callback(tokenFromMail(ctx.mailer));
    expect(cb.status).toBe(303);
    expect(cb.headers.get('Location')).toBe(`${APP_URL}/`);
  });

  it('a used link redirects to the web error page with the reason', async () => {
    await client.requestLink('web-twice@example.test');
    const token = tokenFromMail(ctx.mailer);
    await client.callback(token);

    const again = await client.callback(token);
    expect(again.status).toBe(303);
    expect(again.headers.get('Location')).toBe(`${APP_URL}/auth/error?reason=used`);
    expect(again.headers.get('Set-Cookie')).toBeNull();
  });
});
