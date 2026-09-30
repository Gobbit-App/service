import { describe, it, expect } from 'vitest';
import { latestJournalTag } from '@pb/db';
import { setupApiTest } from './helpers';

describe('health and API access control', () => {
  const ctx = setupApiTest();

  it('GET /health returns 200 with ok true and db_ms as number', async () => {
    const res = await ctx.app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.db_ms).toBe('number');
  });

  it('GET /health migration field matches latest journal tag', async () => {
    const res = await ctx.app.request('/health');
    const body = await res.json();
    expect(body.migration).toBe(latestJournalTag());
  });

  it('GET /openapi.json returns 200 without auth headers', async () => {
    const res = await ctx.app.request('/openapi.json');
    expect(res.status).toBe(200);
  });

  it('GET /decks without auth headers returns 401 unauthorized', async () => {
    const res = await ctx.app.request('/decks');
    expect(res.status).toBe(401);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('application/problem+json');
    const body = await res.json();
    expect(body.type).toBe('/problems/unauthorized');
  });

  it('GET /nope with auth headers returns 404 not found problem', async () => {
    const res = await ctx.app.request('/nope', {
      headers: ctx.as(),
    });
    expect(res.status).toBe(404);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('application/problem+json');
    const body = await res.json();
    expect(body.type).toBe('/problems/not-found');
  });

  it('response includes X-Request-Id header', async () => {
    const res = await ctx.app.request('/health');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('provided X-Request-Id header is echoed in response', async () => {
    const customRequestId = 'custom-request-id-abc123';
    const res = await ctx.app.request('/health', {
      headers: {
        'X-Request-Id': customRequestId,
      },
    });
    expect(res.headers.get('X-Request-Id')).toBe(customRequestId);
  });
});
