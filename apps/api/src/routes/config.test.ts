import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../types';
import { buildAppConfig, CONFIG_CACHE_CONTROL, registerConfigRoutes } from './config';

const FAKE_URL = ['cloudinary://', 'key123', ':', 'not-a-real-secret', '@', 'demo'].join('');

describe('buildAppConfig', () => {
  it('exposes only the cloud name and commit', () => {
    const config = buildAppConfig({ CLOUDINARY_URL: FAKE_URL, GIT_SHA: 'abc' });
    expect(config).toEqual({ cloudinaryCloudName: 'demo', commit: 'abc' });
    expect(JSON.stringify(config)).not.toContain('key123');
    expect(JSON.stringify(config)).not.toContain('not-a-real-secret');
  });

  it('falls back when Cloudinary and the commit are unset', () => {
    expect(buildAppConfig({ CLOUDINARY_URL: undefined, GIT_SHA: undefined })).toEqual({
      cloudinaryCloudName: null,
      commit: 'dev',
    });
  });
});

describe('GET /config', () => {
  it('answers with a cacheable public config', async () => {
    const app = new OpenAPIHono<AppEnv>();
    registerConfigRoutes(app, { CLOUDINARY_URL: FAKE_URL, GIT_SHA: 'abc' });
    const res = await app.request('/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(CONFIG_CACHE_CONTROL);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ cloudinaryCloudName: 'demo', commit: 'abc' });
    expect(body).not.toContain('not-a-real-secret');
  });
});
