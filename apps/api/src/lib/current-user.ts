import type { Context } from 'hono';
import type { AppEnv, CurrentUser } from '../types';
import { unauthorized } from '../errors/http-errors';

export function getUser(c: Context<AppEnv>): CurrentUser {
  const user = c.get('user');
  if (!user) {
    throw unauthorized('Authentication required');
  }
  return user;
}
