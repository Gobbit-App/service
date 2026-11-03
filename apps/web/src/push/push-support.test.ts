import { describe, expect, it } from 'vitest';
import {
  applicationServerKey,
  deviceLabel,
  isIos,
  pushSupport,
  type PushEnvironment,
} from './push-support';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const FIREFOX_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';

const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
  userAgent: CHROME_ANDROID,
  standalone: false,
  ...over,
});

describe('pushSupport (037, D297)', () => {
  it('is ready on a capable browser that has not blocked notifications', () => {
    expect(pushSupport(env())).toBe('ready');
    expect(pushSupport(env({ permission: 'granted' }))).toBe('ready');
  });

  it('reports a blocked permission', () => {
    expect(pushSupport(env({ permission: 'denied' }))).toBe('denied');
  });

  it('reports a browser without the APIs', () => {
    expect(pushSupport(env({ hasPushManager: false }))).toBe('unsupported');
    expect(pushSupport(env({ hasServiceWorker: false }))).toBe('unsupported');
    expect(pushSupport(env({ hasNotification: false, permission: undefined }))).toBe('unsupported');
  });

  it('asks iPhone users to install first, even when Safari lacks the APIs in a tab', () => {
    expect(pushSupport(env({ userAgent: SAFARI_IPHONE, hasPushManager: false }))).toBe(
      'ios-not-installed',
    );
    expect(pushSupport(env({ userAgent: SAFARI_IPHONE, standalone: true }))).toBe('ready');
  });

  it('treats a touch "Macintosh" as an iPad, a desktop Mac as a Mac', () => {
    expect(isIos(SAFARI_MAC, 5)).toBe(true);
    expect(isIos(SAFARI_MAC, 0)).toBe(false);
    expect(pushSupport(env({ userAgent: SAFARI_MAC }), 0)).toBe('ready');
  });
});

describe('applicationServerKey', () => {
  it('decodes base64url without padding', () => {
    expect([...applicationServerKey('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('deviceLabel', () => {
  it.each([
    [CHROME_ANDROID, 'Chrome on Android'],
    [SAFARI_IPHONE, 'Safari on iPhone'],
    [SAFARI_MAC, 'Safari on Mac'],
    [FIREFOX_WIN, 'Firefox on Windows'],
    [EDGE_WIN, 'Edge on Windows'],
  ])('names %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it('gives nothing for an unknown agent', () => {
    expect(deviceLabel('curl/8.0')).toBeUndefined();
  });
});
