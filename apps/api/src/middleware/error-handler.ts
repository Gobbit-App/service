import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { InvalidCursorError } from '@gobbit/shared';
import { HttpError, problemFromZodError, problemResponse } from '../errors/http-errors';
import { mapPgError } from '../errors/pg-error-map';
import { childLogger, type Logger } from '../lib/logger';
import type { AppEnv } from '../types';

/** Central error → problem+json mapping; only unexpected errors are logged (with stack). */
export function createErrorHandler(log: Logger = childLogger('http')) {
  return (err: Error, c: Context<AppEnv>): Response => handleError(err, c, log);
}

export const errorHandler = createErrorHandler();

function handleError(err: Error, c: Context<AppEnv>, log: Logger): Response {
  if (err instanceof HttpError) {
    return problemResponse(c, err.toProblem(), err.headers);
  }

  if (err instanceof HTTPException) {
    return problemResponse(c, {
      type: '/problems/http',
      title: err.message || 'HTTP error',
      status: err.status,
    });
  }

  if (err instanceof ZodError) {
    return problemResponse(c, problemFromZodError(err));
  }

  if (err instanceof InvalidCursorError) {
    return problemResponse(c, {
      type: '/problems/invalid-cursor',
      title: 'Invalid cursor',
      status: 400,
    });
  }

  const pgError = mapPgError(err);
  if (pgError) {
    return problemResponse(c, pgError);
  }

  log.error(
    { err, requestId: c.get('requestId') ?? null, method: c.req.method, path: c.req.path },
    'unhandled error',
  );

  return problemResponse(c, {
    type: '/problems/internal',
    title: 'Internal Server Error',
    status: 500,
  });
}

export function notFoundHandler(c: Context<AppEnv>): Response {
  return problemResponse(c, {
    type: '/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Route not found',
  });
}
