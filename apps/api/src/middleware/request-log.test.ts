import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestLog } from './request-log';
import type { AppEnv } from '../types';

function setup() {
  const lines: string[] = [];
  let t = 0;
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestLog(
      (line) => lines.push(line),
      () => (t += 5),
    ),
  );
  app.use('*', async (c, next) => {
    c.set('requestId', 'req-1');
    await next();
  });
  return { app, lines };
}

describe('requestLog', () => {
  it('logs method, path without query, status, duration and request id', async () => {
    const { app, lines } = setup();
    app.get('/decks/:id/search', (c) => c.json({ ok: true }));

    await app.request('/decks/abc/search?q=secret%20text');

    expect(lines).toEqual(['[api] GET /decks/abc/search 200 5ms req-1']);
  });

  it('logs the status of error responses', async () => {
    const { app, lines } = setup();
    app.get('/boom', (c) => c.json({ error: true }, 403));

    await app.request('/boom');

    expect(lines).toEqual(['[api] GET /boom 403 5ms req-1']);
  });

  it('skips healthcheck polling', async () => {
    const { app, lines } = setup();
    app.get('/health', (c) => c.json({ ok: true }));

    await app.request('/health');

    expect(lines).toEqual([]);
  });
});
