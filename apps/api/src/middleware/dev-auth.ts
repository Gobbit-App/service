import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { unauthorized } from '../errors/http-errors';
import type { AppEnv, CurrentUser } from '../types';

export const DEV_AUTH_BYPASS_PATHS = ['/health', '/openapi.json'];

export function devAuth(opts: {
  token: string;
  lookupUser: (email: string) => Promise<CurrentUser | null>;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;

    // Bypass certain paths
    if (DEV_AUTH_BYPASS_PATHS.includes(path)) {
      return next();
    }

    // Extract and validate Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized('Invalid Authorization header');
    }

    const givenToken = authHeader.slice(7); // Remove 'Bearer '
    const givenBuffer = Buffer.from(givenToken);
    const expectedBuffer = Buffer.from(opts.token);

    // Check length first for constant-time comparison
    if (givenBuffer.length !== expectedBuffer.length) {
      throw unauthorized('Invalid token');
    }

    if (!timingSafeEqual(givenBuffer, expectedBuffer)) {
      throw unauthorized('Invalid token');
    }

    // Extract X-Dev-User header
    const devUser = c.req.header('X-Dev-User');
    if (!devUser) {
      throw unauthorized('Missing X-Dev-User header');
    }

    // Look up the user
    const user = await opts.lookupUser(devUser.trim().toLowerCase());
    if (!user) {
      throw unauthorized('User not found');
    }

    // Set the user in context
    c.set('user', user);

    return next();
  };
}
