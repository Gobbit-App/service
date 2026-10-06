import { describe, expect, it } from 'vitest';
import { json, setupApiTest } from './helpers';

/** Built from parts so no credentials-shaped literal sits in the source. */
const CLOUDINARY_URL = ['cloudinary://', 'key123', ':', 'not-a-real-secret', '@', 'demo'].join('');

describe('GET /config (D55)', () => {
  const ctx = setupApiTest({ env: { CLOUDINARY_URL, GIT_SHA: 'abc123' } });

  it('is public and exposes only the cloud name and commit', async () => {
    const res = await ctx.app.request('/config', { headers: ctx.anon() });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');

    const body = await json(res);
    expect(body).toEqual({ cloudinaryCloudName: 'demo', commit: 'abc123' });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('key123');
    expect(raw).not.toContain('not-a-real-secret');
  });
});

describe('GET /config without Cloudinary', () => {
  const ctx = setupApiTest();

  it('reports a null cloud name and the dev commit', async () => {
    const res = await ctx.app.request('/config', { headers: ctx.anon() });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ cloudinaryCloudName: null, commit: 'dev' });
  });
});
