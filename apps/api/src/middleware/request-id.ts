import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from '../types';

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = c.req.header('X-Request-Id') ?? crypto.randomUUID();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}
