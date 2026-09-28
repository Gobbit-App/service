import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { InvalidCursorError } from '@pb/shared';
import { errorHandler, notFoundHandler } from './error-handler';
import { notFound } from '../errors/http-errors';
import type { AppEnv } from '../types';

describe('errorHandler', () => {
  let app: Hono<AppEnv>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = new Hono<AppEnv>();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('handles HttpError notFound', async () => {
    app.get('/test', (c) => {
      c.set('requestId', 'test-id');
      throw notFound('Pocketbook not found');
    });
    app.onError((err, c) => errorHandler(err, c));

    const res = await app.request('/test');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/not-found');
    expect(body.status).toBe(404);
  });

  it('handles ZodError with validation problem', async () => {
    app.get('/test', (c) => {
      c.set('requestId', 'test-id');
      z.string().parse(1);
      return c.json({});
    });
    app.onError((err, c) => errorHandler(err, c));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/validation');
    expect(body.status).toBe(400);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('handles InvalidCursorError', async () => {
    app.get('/test', (c) => {
      c.set('requestId', 'test-id');
      throw new InvalidCursorError('Invalid cursor');
    });
    app.onError((err, c) => errorHandler(err, c));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/invalid-cursor');
    expect(body.status).toBe(400);
  });

  it('handles pg error with code 23505', async () => {
    app.get('/test', (c) => {
      c.set('requestId', 'test-id');
      const err = Object.assign(new Error('duplicate key'), { code: '23505' });
      throw err;
    });
    app.onError((err, c) => errorHandler(err, c));

    const res = await app.request('/test');
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/conflict');
    expect(body.status).toBe(409);
  });

  it('handles unknown error with 500 and does not leak internals', async () => {
    app.get('/test', (c) => {
      c.set('requestId', 'test-id');
      throw new Error('secret SQL here');
    });
    app.onError((err, c) => errorHandler(err, c));

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/internal');
    expect(body.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret SQL');

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('notFoundHandler returns 404', async () => {
    app.get('/exists', (c) => c.json({ ok: true }));
    app.notFound((c) => notFoundHandler(c));

    const res = await app.request('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');

    const body = (await res.json()) as any;
    expect(body.type).toBe('/problems/not-found');
    expect(body.status).toBe(404);
    expect(body.detail).toBe('Route not found');
  });
});
