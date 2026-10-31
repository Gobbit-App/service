import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../types';
import { buildAppConfig, CONFIG_CACHE_CONTROL, registerConfigRoutes } from './config';

const FAKE_URL = ['cloudinary://', 'key123', ':', 'not-a-real-secret', '@', 'demo'].join('');

describe('buildAppConfig', () => {
  it('D245: exposes the analytics site and host only when ANALYTICS_SITE_ID is set', () => {
    const siteId = '0b8f2f4e-3c1a-4d2b-9e6f-1a2b3c4d5e6f';
    const base = { CLOUDINARY_URL: undefined, GIT_SHA: undefined, API_URL: 'https://api.example' };
    expect(buildAppConfig(base).analytics).toBeNull();
    expect(
      buildAppConfig({ ...base, ANALYTICS_SITE_ID: siteId, APP_URL: 'https://gobbit.example' })
        .analytics,
    ).toEqual({ siteId, host: 'gobbit.example' });
    expect(buildAppConfig({ ...base, ANALYTICS_SITE_ID: siteId }).analytics).toEqual({
      siteId,
      host: 'api.example',
    });
  });

  it('exposes only the cloud name, commit and search flags', () => {
    const config = buildAppConfig({ CLOUDINARY_URL: FAKE_URL, GIT_SHA: 'abc' });
    expect(config).toEqual({
      cloudinaryCloudName: 'demo',
      commit: 'abc',
      search: { semantic: false, ask: false },
      ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
      analytics: null,
    });
    expect(JSON.stringify(config)).not.toContain('key123');
    expect(JSON.stringify(config)).not.toContain('not-a-real-secret');
  });

  it('falls back when Cloudinary and the commit are unset', () => {
    expect(buildAppConfig({ CLOUDINARY_URL: undefined, GIT_SHA: undefined })).toEqual({
      cloudinaryCloudName: null,
      commit: 'dev',
      search: { semantic: false, ask: false },
      ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
      analytics: null,
    });
  });

  it('flags semantic search and Ask only when their provider keys are set, never the keys', () => {
    const config = buildAppConfig({
      CLOUDINARY_URL: undefined,
      GIT_SHA: 'abc',
      OPENAI_API_KEY: 'openai-test-value',
      ANTHROPIC_API_KEY: 'anthropic-test-value',
    });
    expect(config.search).toEqual({ semantic: true, ask: true });
    expect(JSON.stringify(config)).not.toContain('test-value');
  });

  it('flags both features from an OpenRouter key alone', () => {
    const config = buildAppConfig({
      CLOUDINARY_URL: undefined,
      GIT_SHA: 'abc',
      OPENROUTER_API_KEY: 'openrouter-test-value',
    });
    expect(config.search).toEqual({ semantic: true, ask: true });
    expect(JSON.stringify(config)).not.toContain('test-value');
  });

  it('enables ingest with an extraction provider and shows the Shortcut link', () => {
    const config = buildAppConfig({
      CLOUDINARY_URL: undefined,
      GIT_SHA: 'abc',
      ANTHROPIC_API_KEY: 'anthropic-test-value',
      SHORTCUT_URL: 'https://www.icloud.com/shortcuts/abc',
    });
    expect(config.ingest).toEqual({
      enabled: true,
      emailDomain: null,
      shortcutUrl: 'https://www.icloud.com/shortcuts/abc',
    });
  });

  it('shows the email-in domain only with the domain, webhook secret and API key (D104)', () => {
    const base = { CLOUDINARY_URL: undefined, GIT_SHA: 'abc', ANTHROPIC_API_KEY: 'a' };
    expect(
      buildAppConfig({ ...base, INGEST_EMAIL_DOMAIN: 'in.example.com' }).ingest.emailDomain,
    ).toBe(null);
    expect(
      buildAppConfig({
        ...base,
        INGEST_EMAIL_DOMAIN: 'in.example.com',
        RESEND_WEBHOOK_SECRET: 'whsec-test-value',
      }).ingest.emailDomain,
    ).toBe(null);
    const config = buildAppConfig({
      ...base,
      INGEST_EMAIL_DOMAIN: 'in.example.com',
      RESEND_WEBHOOK_SECRET: 'whsec-test-value',
      RESEND_API_KEY: 're-test-value',
    });
    expect(config.ingest.emailDomain).toBe('in.example.com');
    expect(JSON.stringify(config)).not.toContain('whsec-test-value');
  });

  it('keeps email-in off without an extraction provider', () => {
    const config = buildAppConfig({
      CLOUDINARY_URL: undefined,
      GIT_SHA: 'abc',
      INGEST_EMAIL_DOMAIN: 'in.example.com',
      RESEND_WEBHOOK_SECRET: 'whsec-test-value',
      RESEND_API_KEY: 're-test-value',
    });
    expect(config.ingest).toEqual({ enabled: false, emailDomain: null, shortcutUrl: null });
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
    expect(JSON.parse(body)).toEqual({
      cloudinaryCloudName: 'demo',
      commit: 'abc',
      search: { semantic: false, ask: false },
      ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
      analytics: null,
    });
    expect(body).not.toContain('not-a-real-secret');
  });
});
