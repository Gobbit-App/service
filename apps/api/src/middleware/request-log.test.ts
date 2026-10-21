import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestLog } from './request-log';
import { captureLogger } from '../../test/capture-logger';
import type { AppEnv } from '../types';

function setup() {
  const { lines, logger, flush } = captureLogger();
  let t = 0;
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestLog(logger, () => (t += 5)),
  );
  app.use('*', async (c, next) => {
    c.set('requestId', 'req-1');
    await next();
  });
  return { app, lines, flush };
}

describe('requestLog', () => {
  it('logs method, path without query, status, duration and request id', async () => {
    const { app, lines, flush } = setup();
    app.get('/decks/:id/search', (c) => c.json({ ok: true }));

    await app.request('/decks/abc/search?q=secret%20text');
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      msg: 'request',
      requestId: 'req-1',
      method: 'GET',
      path: '/decks/abc/search',
      status: 200,
      durationMs: 5,
    });
    expect(JSON.stringify(lines[0])).not.toContain('secret');
  });

  it('logs client errors at warn', async () => {
    const { app, lines, flush } = setup();
    app.get('/boom', (c) => c.json({ error: true }, 403));

    await app.request('/boom');
    await flush();

    expect(lines[0]).toMatchObject({ level: 'warn', path: '/boom', status: 403 });
  });

  it('logs server errors at error', async () => {
    const { app, lines, flush } = setup();
    app.get('/down', (c) => c.json({ error: true }, 503));

    await app.request('/down');
    await flush();

    expect(lines[0]).toMatchObject({ level: 'error', status: 503 });
  });

  it('skips healthcheck polling', async () => {
    const { app, lines, flush } = setup();
    app.get('/health', (c) => c.json({ ok: true }));

    await app.request('/health');
    await flush();

    expect(lines).toEqual([]);
  });
});
