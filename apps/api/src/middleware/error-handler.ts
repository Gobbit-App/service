import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { InvalidCursorError } from '@pb/shared';
import { HttpError, problemFromZodError, problemResponse } from '../errors/http-errors';
import { mapPgError } from '../errors/pg-error-map';
import type { AppEnv } from '../types';

export function errorHandler(err: Error, c: Context<AppEnv>): Response {
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

  const requestId = c.get('requestId');
  console.error(`[${requestId}]`, err);

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
