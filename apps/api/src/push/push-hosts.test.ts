import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from './push-hosts';

describe('isAllowedPushEndpoint (D296)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/QGx',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://FCM.googleapis.com:443/fcm/send/abc',
  ])('allows %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pw@fcm.googleapis.com/fcm/send/abc',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://push.services.mozilla.com.evil.example/x',
    'https://127.0.0.1/x',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });
});
