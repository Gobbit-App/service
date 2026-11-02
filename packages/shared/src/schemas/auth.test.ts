import { describe, expect, it } from 'vitest';
import { magicLinkRequestSchema, NEXT_PATH_MAX } from './auth';
import { appConfigSchema } from './config';

describe('magicLinkRequestSchema', () => {
  it('accepts an email without next', () => {
    expect(magicLinkRequestSchema.parse({ email: 'a@example.com' })).toEqual({
      email: 'a@example.com',
    });
  });

  it('accepts a next path', () => {
    const parsed = magicLinkRequestSchema.parse({ email: 'a@example.com', next: '/d/family' });
    expect(parsed.next).toBe('/d/family');
  });

  it('rejects a next longer than the cap', () => {
    const next = `/${'a'.repeat(NEXT_PATH_MAX)}`;
    expect(magicLinkRequestSchema.safeParse({ email: 'a@example.com', next }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(magicLinkRequestSchema.safeParse({ email: 'a@example.com', x: 1 }).success).toBe(false);
  });
});

describe('appConfigSchema', () => {
  const OFF = { semantic: false, ask: false };
  const INGEST_OFF = { enabled: false, emailDomain: null, shortcutUrl: null };

  it('allows a missing cloud name', () => {
    expect(
      appConfigSchema.parse({
        cloudinaryCloudName: null,
        commit: 'dev',
        search: OFF,
        ingest: INGEST_OFF,
        analytics: null,
      }).commit,
    ).toBe('dev');
  });

  it('strips anything that is not part of the public config', () => {
    const parsed = appConfigSchema.parse({
      cloudinaryCloudName: 'demo',
      commit: 'abc',
      search: OFF,
      ingest: INGEST_OFF,
      analytics: { siteId: 'site-1', host: 'gobbit.example', secret: 'nope' },
      apiSecret: 'nope',
    });
    expect(parsed).toEqual({
      cloudinaryCloudName: 'demo',
      commit: 'abc',
      search: OFF,
      ingest: INGEST_OFF,
      analytics: { siteId: 'site-1', host: 'gobbit.example' },
    });
  });
});
