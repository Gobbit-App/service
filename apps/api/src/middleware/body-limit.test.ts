import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { API_BODY_MAX_BYTES } from '@pb/shared';
import { bodyLimits } from './body-limit';

function appWithLimits(): Hono {
  const app = new Hono();
  app.use('*', bodyLimits());
  app.post('/ingest', async (c) => c.text(String((await c.req.text()).length)));
  app.post('/items', async (c) => c.text(String((await c.req.text()).length)));
  return app;
}

const post = (app: Hono, path: string, bytes: number) =>
  app.request(path, {
    method: 'POST',
    body: 'a'.repeat(bytes),
    headers: { 'Content-Length': String(bytes) },
  });

describe('bodyLimits (D101)', () => {
  it('accepts a body at the 1 MB default', async () => {
    const res = await post(appWithLimits(), '/items', API_BODY_MAX_BYTES);
    expect(res.status).toBe(200);
  });

  it('answers 413 problem+json above 1 MB outside /ingest', async () => {
    const res = await post(appWithLimits(), '/items', API_BODY_MAX_BYTES + 1);
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect((await res.json()).type).toBe('/problems/payload-too-large');
  });

  it('lets /ingest take more than 1 MB', async () => {
    const res = await post(appWithLimits(), '/ingest', API_BODY_MAX_BYTES * 2);
    expect(res.status).toBe(200);
  });
});
