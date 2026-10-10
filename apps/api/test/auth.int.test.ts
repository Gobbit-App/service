import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/tokens';
import { SESSION_COOKIE } from '../src/lib/cookies';
import { personalDeckSlug } from '../src/repositories/decks.repo';
import { createAccountUser, createDeck } from '@pb/db/test';
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
    requestLink: (email: string, next?: string) =>
      ctx.app.request('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-ip': ip },
        body: JSON.stringify({ email, next }),
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
    expect(body.decks).toHaveLength(1);
    expect(body.decks[0]).toMatchObject({ slug: 'me', isDefault: true, role: 'owner' });

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

  it('success returns to a safe next path (P3.0)', async () => {
    await client.requestLink('web-next@example.test', '/d/family?all=true');
    const cb = await client.callback(tokenFromMail(ctx.mailer));
    expect(cb.status).toBe(303);
    expect(cb.headers.get('Location')).toBe(`${APP_URL}/d/family?all=true`);
  });

  it('an off-site next is dropped and the user lands on the root', async () => {
    client.rotateIp();
    await client.requestLink('web-evil@example.test', '//evil.example/steal');
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

  it('a link whose personal deck cannot be created redirects to onboarding and stays usable', async () => {
    const blocked = await createAccountUser(ctx.t.db, { email: 'blocked@example.test' });
    // A non-default deck already holds the account's personal slug, so ensureDefault inserts nothing.
    const blocker = await createDeck(ctx.t.db, blocked, {
      slug: personalDeckSlug(blocked.accountId),
    });

    await client.requestLink(blocked.email);
    const token = tokenFromMail(ctx.mailer);

    const failed = await client.callback(token);
    expect(failed.status).toBe(303);
    expect(failed.headers.get('Location')).toBe(`${APP_URL}/auth/error?reason=onboarding`);
    expect(failed.headers.get('Set-Cookie')).toBeNull();
    const unconsumed = await ctx.t.pool.query('SELECT used_at FROM magic_links WHERE email = $1', [
      blocked.email,
    ]);
    expect(unconsumed.rows[0].used_at).toBeNull();

    await ctx.t.pool.query('DELETE FROM decks WHERE id = $1', [blocker.id]);
    const retry = await client.callback(token);
    expect(retry.status).toBe(303);
    expect(retry.headers.get('Location')).toBe(`${APP_URL}/`);
    expect(sessionTokenFromSetCookie(retry)).not.toBeNull();
  });
});

describe('sign-in onboarding (Phase 3B)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: 'x-test-ip' } });
  let client: ReturnType<typeof authClient>;

  beforeEach(() => {
    client = authClient(ctx);
    ctx.mailer.clear();
  });

  const personalDecksFor = async (email: string) =>
    (
      await ctx.t.pool.query(
        `SELECT d.id, d.slug FROM decks d JOIN users u ON u.account_id = d.owner_account_id
         WHERE u.email = $1 AND d.is_default AND d.deleted_at IS NULL`,
        [email],
      )
    ).rows;

  it('a second sign-in keeps exactly one personal deck', async () => {
    await client.requestLink('twice-onboard@example.test');
    expect((await client.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    await client.requestLink('twice-onboard@example.test');
    expect((await client.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    expect(await personalDecksFor('twice-onboard@example.test')).toHaveLength(1);
  });

  it('an existing user without a personal deck gets one on sign-in', async () => {
    const existing = await createAccountUser(ctx.t.db, { email: 'no-deck@example.test' });
    expect(await personalDecksFor(existing.email)).toHaveLength(0);

    await client.requestLink(existing.email);
    expect((await client.callback(tokenFromMail(ctx.mailer))).status).toBe(303);

    const rows = await personalDecksFor(existing.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe(personalDeckSlug(existing.accountId));
  });

  it('an invitee gets their own personal deck, invisible to the inviter', async () => {
    const invite = await ctx.app.request('/decks/family/invites', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ email: 'invitee-onboard@example.test', role: 'reader' }),
    });
    expect(invite.status).toBe(201);

    const cb = await client.callback(tokenFromMail(ctx.mailer));
    expect(cb.status).toBe(303);

    const [personal] = await personalDecksFor('invitee-onboard@example.test');
    expect(personal).toBeDefined();
    const peek = await ctx.app.request(`/decks/${personal.id}`, { headers: ctx.as() });
    expect(peek.status).toBe(404);
  });
});
