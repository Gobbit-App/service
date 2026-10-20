import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, CurrentUser } from '../types';
import { HttpError } from '../errors/http-errors';
import { getActor } from './current-user';

const USER: CurrentUser = {
  id: 'u1',
  accountId: 'a1',
  email: 'dev@example.test',
  displayName: 'dev',
};

/** Runs `getActor` inside a request whose auth middleware set `user` (or nothing). */
async function actorFor(user: CurrentUser | undefined, via?: 'bearer' | 'cookie') {
  const app = new Hono<AppEnv>();
  let result: unknown;
  app.get('/', (c) => {
    if (user) c.set('user', user);
    if (user && via) c.set('auth', { user, via, session: {} as never });
    try {
      result = getActor(c);
    } catch (err) {
      result = err;
    }
    return c.text('ok');
  });
  await app.request('/');
  return result;
}

describe('getActor (D130)', () => {
  it('is a session actor for a cookie session', async () => {
    expect(await actorFor(USER, 'cookie')).toEqual({ user: USER, via: 'session' });
  });

  it('is a session actor for a bearer session', async () => {
    expect(await actorFor(USER, 'bearer')).toEqual({ user: USER, via: 'session' });
  });

  it('throws 401 without a user', async () => {
    const err = await actorFor(undefined);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
  });
});
