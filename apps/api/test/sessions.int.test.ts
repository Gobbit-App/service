import { afterEach, describe, expect, it } from 'vitest';
import { createAccountUser, openSession } from '@pb/db/test';
import { SESSION_COOKIE } from '../src/lib/cookies';
import { json, sessionTokenFromSetCookie, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;
const APP_ORIGIN = 'http://app.test';

describe('sessions (P2.1, D27–D32)', () => {
  const ctx = setupApiTest({ env: { CORS_ORIGINS: APP_ORIGIN } });

  afterEach(() => ctx.clock.reset());

  async function freshUser() {
    const user = await createAccountUser(ctx.t.db);
    const { token, session } = await openSession(ctx.t.db, user, { kind: 'cookie' });
    return { user, token, session };
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const cookie = (token: string) => ({ Cookie: `${SESSION_COOKIE}=${token}` });
  const me = (headers: Record<string, string>) => ctx.app.request('/me', { headers });
  const post = (path: string, headers: Record<string, string>) =>
    ctx.app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    });

  it('the same token authenticates as bearer and as cookie', async () => {
    const { user, token } = await freshUser();

    for (const headers of [bearer(token), cookie(token)]) {
      const res = await me(headers);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.user).toEqual({ id: user.id, email: user.email, displayName: user.displayName });
      expect(body.decks).toEqual([]);
    }
  });

  it('logout via cookie revokes the session for both forms and clears the cookie', async () => {
    const { token } = await freshUser();

    const res = await post('/auth/logout', cookie(token));
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);

    expect((await me(bearer(token))).status).toBe(401);
    expect((await me(cookie(token))).status).toBe(401);
  });

  it('an expired session is rejected', async () => {
    const { token } = await freshUser();
    ctx.clock.advance(91 * DAY_MS);
    const res = await me(bearer(token));
    expect(res.status).toBe(401);
    expect((await json(res)).type).toBe('/problems/session-invalid');
  });

  it('a request after the touch interval slides expires_at forward', async () => {
    const { token, session } = await freshUser();
    ctx.clock.advance(30 * DAY_MS);

    expect((await me(bearer(token))).status).toBe(200);

    const { rows } = await ctx.t.pool.query('SELECT expires_at FROM sessions WHERE id = $1', [
      session.id,
    ]);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(session.expiresAt.getTime());
  });

  it('token-exchange mints a separate bearer; logging it out leaves the cookie alive', async () => {
    const { token } = await freshUser();

    const res = await post('/auth/token-exchange', cookie(token));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.token).not.toBe(token);
    expect(typeof body.expiresAt).toBe('string');

    expect((await me(bearer(body.token))).status).toBe(200);
    expect((await me(cookie(token))).status).toBe(200);

    expect((await post('/auth/logout', bearer(body.token))).status).toBe(204);
    expect((await me(bearer(body.token))).status).toBe(401);
    expect((await me(cookie(token))).status).toBe(200);
  });

  it('token-exchange refuses a bearer-authenticated request', async () => {
    const { token } = await freshUser();
    const res = await post('/auth/token-exchange', bearer(token));
    expect(res.status).toBe(403);
    expect((await json(res)).type).toBe('/problems/cookie-session-required');
  });

  it('token-exchange refuses a bearer-kind session presented as a cookie', async () => {
    const user = await createAccountUser(ctx.t.db);
    const { token } = await openSession(ctx.t.db, user, { kind: 'bearer' });
    const res = await post('/auth/token-exchange', cookie(token));
    expect(res.status).toBe(403);
  });

  it('logout-all revokes every session of the user', async () => {
    const { user, token } = await freshUser();
    const other = await openSession(ctx.t.db, user, { kind: 'bearer' });

    expect((await post('/auth/logout-all', bearer(other.token))).status).toBe(204);

    expect((await me(cookie(token))).status).toBe(401);
    expect((await me(bearer(other.token))).status).toBe(401);
  });

  it('a soft-deleted user is rejected', async () => {
    const { user, token } = await freshUser();
    await ctx.t.pool.query('UPDATE users SET deleted_at = now() WHERE id = $1', [user.id]);
    expect((await me(bearer(token))).status).toBe(401);
  });

  it('an invalid cookie on a protected route is 401 and clears the cookie', async () => {
    const res = await me(cookie('not-a-real-token'));
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);
  });

  it('a stale cookie does not block the public sign-in routes', async () => {
    const res = await ctx.app.request('/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cookie('stale') },
      body: JSON.stringify({ email: 'stale-cookie@example.test' }),
    });
    expect(res.status).toBe(200);
  });

  it('bearer wins over cookie when both are present', async () => {
    const a = await freshUser();
    const b = await freshUser();
    const res = await me({ ...bearer(a.token), ...cookie(b.token) });
    expect((await json(res)).user.id).toBe(a.user.id);
  });

  describe('CORS', () => {
    const preflight = (origin: string) =>
      ctx.app.request('/decks', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      });

    it('a listed origin gets credentials allowed', async () => {
      const res = await preflight(APP_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('an unlisted origin gets no allow-origin', async () => {
      const res = await preflight('http://evil.example');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('CSRF', () => {
    const formPost = (headers: Record<string, string>) =>
      ctx.app.request('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Origin: 'http://evil.example', ...headers },
        body: 'x',
      });

    it('a cookie-authenticated form post from a foreign origin is 403', async () => {
      const { token } = await freshUser();
      const res = await formPost(cookie(token));
      expect(res.status).toBe(403);
      expect((await json(res)).type).toBe('/problems/csrf');
      expect((await me(cookie(token))).status).toBe(200);
    });

    it('the same post from a listed origin passes', async () => {
      const { token } = await freshUser();
      const res = await formPost({ ...cookie(token), Origin: APP_ORIGIN });
      expect(res.status).toBe(204);
    });

    it('the same post with a bearer skips the check', async () => {
      const { token } = await freshUser();
      const res = await formPost(bearer(token));
      expect(res.status).toBe(204);
    });
  });

  it('sessionTokenFromSetCookie helper reads the cookie value', () => {
    const res = new Response(null, { headers: { 'Set-Cookie': `${SESSION_COOKIE}=abc; Path=/` } });
    expect(sessionTokenFromSetCookie(res)).toBe('abc');
  });
});
