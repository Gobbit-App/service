import { describe, expect, it } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import {
  analyticsHead,
  analyticsTag,
  recordAnalyticsConfig,
  STATS_BASE_PATH,
  withPage,
} from './analytics';

const SITE_ID = '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90';
const env = { API_URL: 'https://gobbit.example.test/api', APP_URL: 'https://gobbit.example.test' };

describe('analyticsTag (D232, contract §2)', () => {
  it('is a deferred, same-origin script with Do Not Track on', () => {
    expect(STATS_BASE_PATH).toBe('/stats');
    expect(analyticsTag({ siteId: SITE_ID, host: 'gobbit.example.test' }).toString()).toBe(
      `<script defer src="/stats/script.js" data-website-id="${SITE_ID}" data-host-url="/stats" data-domains="gobbit.example.test" data-do-not-track="true"></script>`,
    );
  });

  it('escapes attribute values', () => {
    const html = analyticsTag({ siteId: '"><img src=x>', host: 'a"b' }).toString();
    expect(html).not.toContain('"><img');
    expect(html).toContain('data-domains="a&quot;b"');
  });
});

describe('analyticsTag with a page (D249, contract §3)', () => {
  const page = { pattern: '/p/:deck', name: 'Public deck' };

  it('loads page.js first, then the tracker with its before-send hook and no query or hash', () => {
    const html = analyticsTag({ siteId: SITE_ID, host: 'gobbit.example.test', page }).toString();
    const [first, second] = html.split('\n');
    expect(first).toBe(
      '<script defer src="/analytics/page.js" data-pattern="/p/:deck" data-screen="Public deck"></script>',
    );
    expect(second).toContain('src="/stats/script.js"');
    expect(second).toContain('data-do-not-track="true"');
    expect(second).toContain('data-exclude-search="true" data-exclude-hash="true"');
    expect(second).toContain('data-before-send="__gobbitAnalyticsBeforeSend"');
  });

  it('withPage is undefined when analytics is off', () => {
    expect(withPage(undefined, page)).toBeUndefined();
    expect(withPage({ siteId: SITE_ID, host: 'h' }, page)).toEqual({
      siteId: SITE_ID,
      host: 'h',
      page,
    });
  });
});

describe('analyticsHead', () => {
  it('is undefined when ANALYTICS_SITE_ID is unset', () => {
    expect(analyticsHead(env)).toBeUndefined();
  });

  it('uses the APP_URL host', () => {
    expect(analyticsHead({ ...env, ANALYTICS_SITE_ID: SITE_ID })).toEqual({
      siteId: SITE_ID,
      host: 'gobbit.example.test',
    });
  });

  it('falls back to the API_URL host', () => {
    const head = analyticsHead({
      API_URL: 'http://localhost:3000',
      APP_URL: undefined,
      ANALYTICS_SITE_ID: SITE_ID,
    });
    expect(head?.host).toBe('localhost:3000');
  });
});

describe('recordAnalyticsConfig (D243)', () => {
  it('records enabled with the host and never the site id', async () => {
    const capture = captureLogger();
    recordAnalyticsConfig(
      { ...env, ANALYTICS_SITE_ID: SITE_ID },
      { bootId: 'boot-1' },
      capture.logger,
    );
    await capture.flush();
    const line = expectDecision(capture.lines, 'analytics.config', { outcome: 'enabled' });
    expect(line).toMatchObject({
      level: 'info',
      host: 'gobbit.example.test',
      bootId: 'boot-1',
      surfaces: 'landing,app,public,share',
    });
    expect(JSON.stringify(capture.lines)).not.toContain(SITE_ID);
  });

  it('records disabled without a host', async () => {
    const capture = captureLogger();
    recordAnalyticsConfig(env, { bootId: 'boot-1' }, capture.logger);
    await capture.flush();
    const line = expectDecision(capture.lines, 'analytics.config', { outcome: 'disabled' });
    expect(line.host).toBeUndefined();
    expect(line.surfaces).toBeUndefined();
  });
});
