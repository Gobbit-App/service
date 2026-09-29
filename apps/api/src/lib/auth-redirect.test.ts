import { describe, it, expect } from 'vitest';
import { callbackFailureLocation, callbackSuccessLocation } from './auth-redirect';

const withApp = { API_URL: 'https://api.test', APP_URL: 'https://app.test' };
const noApp = { API_URL: 'https://api.test' };

describe('callbackSuccessLocation', () => {
  it('goes to APP_URL root without next', () => {
    expect(callbackSuccessLocation(withApp, null)).toBe('https://app.test/');
  });

  it('goes to APP_URL at a safe next path', () => {
    expect(callbackSuccessLocation(withApp, '/d/family')).toBe('https://app.test/d/family');
  });

  it.each(['//evil.com', 'https://evil.com', '/'])('ignores unsafe next %s', (next) => {
    expect(callbackSuccessLocation(withApp, next)).toBe('https://app.test/');
  });

  it('goes to API /me without APP_URL, ignoring next', () => {
    expect(callbackSuccessLocation(noApp, '/d/family')).toBe('https://api.test/me');
  });
});

describe('callbackFailureLocation', () => {
  it('returns the web error page with the encoded reason', () => {
    expect(callbackFailureLocation(withApp, 'expired')).toBe(
      'https://app.test/auth/error?reason=expired',
    );
    expect(callbackFailureLocation(withApp, 'a b&c')).toBe(
      'https://app.test/auth/error?reason=a%20b%26c',
    );
  });

  it('returns null without APP_URL', () => {
    expect(callbackFailureLocation(noApp, 'used')).toBeNull();
  });
});
