import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { csrf, csrfOrigins } from './csrf';
import { errorHandler } from './error-handler';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('*', csrf(['https://app.test']));
  app.get('/x', (c) => c.text('ok'));
  app.post('/x', (c) => c.text('posted'));
  return app;
}

const post = (headers: Record<string, string>) =>
  buildApp().request('/x', {
    method: 'POST',
    body: 'a=b',
    headers: { 'Content-Type': 'text/plain', Cookie: 'gobbit_session=abc', ...headers },
  });

describe('csrf', () => {
  it('rejects a foreign Origin with a problem+json 403', async () => {
    const res = await post({ Origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect((await res.json()).type).toBe('/problems/csrf');
  });

  it('passes an allowed origin', async () => {
    const res = await post({ Origin: 'https://app.test' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('posted');
  });

  it('skips the check when an Authorization header is present', async () => {
    const res = await post({ Origin: 'https://evil.test', Authorization: 'Bearer t' });
    expect(res.status).toBe(200);
  });

  it('passes GET requests', async () => {
    const res = await buildApp().request('/x', { headers: { Origin: 'https://evil.test' } });
    expect(res.status).toBe(200);
  });
});

describe('csrfOrigins', () => {
  it('adds the API origin and de-duplicates', () => {
    expect(csrfOrigins(['https://app.test', 'https://api.test'], 'https://api.test/v1')).toEqual([
      'https://app.test',
      'https://api.test',
    ]);
  });
});
