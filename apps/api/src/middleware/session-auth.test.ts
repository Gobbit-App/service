import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Hono } from 'hono';
import type { Authenticated, AppEnv } from '../types';
import { SESSION_COOKIE } from '../lib/cookies';
import { errorHandler } from './error-handler';
import { LENIENT_PATHS, sessionAuth, type SessionAuthOptions } from './session-auth';

const auth = {
  user: { id: 'u1', accountId: 'a1', email: 'a@b.c', displayName: 'A' },
  session: { id: 's1' },
  via: 'cookie',
} as unknown as Authenticated;

describe('sessionAuth', () => {
  let authenticate: Mock<SessionAuthOptions['authenticate']>;
  let app: Hono<AppEnv>;

  beforeEach(() => {
    authenticate = vi.fn<SessionAuthOptions['authenticate']>().mockResolvedValue(auth);
    app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use('*', sessionAuth({ authenticate, cookie: { secure: false } }));
    app.get('/private', (c) => c.json({ user: c.get('user')?.id ?? null }));
    for (const p of LENIENT_PATHS) app.get(p, (c) => c.json({ user: c.get('user')?.id ?? null }));
  });

  const cookie = (v: string) => ({ Cookie: `${SESSION_COOKIE}=${v}` });

  it('is anonymous without credentials', async () => {
    const res = await app.request('/private');
    expect(await res.json()).toEqual({ user: null });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('uses the bearer token', async () => {
    const res = await app.request('/private', { headers: { Authorization: 'Bearer tok' } });
    expect(await res.json()).toEqual({ user: 'u1' });
    expect(authenticate).toHaveBeenCalledWith({ bearer: 'tok' });
  });

  it('uses the cookie when there is no bearer', async () => {
    const res = await app.request('/private', { headers: cookie('ck') });
    expect(await res.json()).toEqual({ user: 'u1' });
    expect(authenticate).toHaveBeenCalledWith({ cookie: 'ck' });
  });

  it('prefers the bearer over the cookie', async () => {
    await app.request('/private', { headers: { Authorization: 'Bearer tok', ...cookie('ck') } });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith({ bearer: 'tok' });
  });

  it('401s on an invalid bearer without clearing the cookie', async () => {
    authenticate.mockResolvedValue(null);
    const res = await app.request('/private', { headers: { Authorization: 'Bearer bad' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('401s on a malformed Authorization header without authenticating', async () => {
    const res = await app.request('/private', { headers: { Authorization: 'Basic abc' } });
    expect(res.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('401s on an invalid cookie and clears it', async () => {
    authenticate.mockResolvedValue(null);
    const res = await app.request('/private', { headers: cookie('stale') });
    expect(res.status).toBe(401);
    expect((await res.json()).type).toBe('/problems/session-invalid');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=;`);
    expect(setCookie).toContain('Max-Age=0');
  });

  it.each(LENIENT_PATHS)('ignores a stale cookie on %s', async (path) => {
    authenticate.mockResolvedValue(null);
    const res = await app.request(path, { headers: cookie('stale') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });
});
