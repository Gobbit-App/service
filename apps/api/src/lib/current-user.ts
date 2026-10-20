import type { Context } from 'hono';
import type { Actor, AppEnv, CurrentUser } from '../types';
import { unauthorized } from '../errors/http-errors';

export function getUser(c: Context<AppEnv>): CurrentUser {
  const user = c.get('user');
  if (!user) {
    throw unauthorized('Authentication required');
  }
  return user;
}

/** D130: the actor a route hands to a service; cookie and bearer sessions are both `session`. */
export function getActor(c: Context<AppEnv>): Actor {
  return { user: getUser(c), via: 'session' };
}
