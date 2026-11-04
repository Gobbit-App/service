import { describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import {
  classifyPush,
  createPushRequestBuilder,
  createPushSender,
  pushTopic,
  vapidFrom,
  PUSH_TTL_SECONDS,
} from './push-sender';

const message = { title: 'Pay rent', body: 'Home · due soon', url: '/i/abc', tag: 'abc' };

describe('classifyPush (D296)', () => {
  it.each([
    [201, null, { kind: 'sent' }],
    [200, null, { kind: 'sent' }],
    [404, null, { kind: 'gone', code: 'http_404' }],
    [410, null, { kind: 'gone', code: 'http_410' }],
    [429, null, { kind: 'retry', code: 'http_429' }],
    [503, null, { kind: 'retry', code: 'http_503' }],
    [400, null, { kind: 'failed', code: 'http_400' }],
    [403, null, { kind: 'failed', code: 'http_403' }],
    [302, null, { kind: 'failed', code: 'http_302' }],
    [null, 'timeout', { kind: 'retry', code: 'timeout' }],
    [null, null, { kind: 'retry', code: 'fetch_failed' }],
    [null, 'blocked', { kind: 'failed', code: 'blocked' }],
    [null, 'host_not_allowed', { kind: 'failed', code: 'host_not_allowed' }],
  ] as const)('%s / %s', (status, error, expected) => {
    expect(classifyPush(status, error)).toEqual(expected);
  });
});

describe('pushTopic', () => {
  it('keeps base64url characters and caps at 32', () => {
    expect(pushTopic('0190f3a2-7b1c-7d00-8e00-1234567890ab')).toBe(
      '0190f3a2-7b1c-7d00-8e00-12345678',
    );
    expect(pushTopic('a b/c+d=')).toBe('abcd');
  });
});

describe('vapidFrom', () => {
  it('is null unless all three are set', () => {
    expect(vapidFrom({})).toBeNull();
    expect(vapidFrom({ VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' })).toBeNull();
    expect(
      vapidFrom({ VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k', VAPID_SUBJECT: 'mailto:a@b.c' }),
    ).toEqual({ publicKey: 'p', privateKey: 'k', subject: 'mailto:a@b.c' });
  });
});

describe('createPushRequestBuilder', () => {
  it('signs and encrypts a POST to the endpoint with TTL, urgency and topic', () => {
    const keys = webpush.generateVAPIDKeys();
    const device = webpush.generateVAPIDKeys(); // any P-256 public key works as p256dh
    const build = createPushRequestBuilder({ ...keys, subject: 'mailto:ops@example.test' });
    const req = build(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: device.publicKey,
        auth: Buffer.alloc(16, 1).toString('base64url'),
      },
      message,
    );
    expect(req.method).toBe('POST');
    expect(req.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(req.headers.TTL).toBe(String(PUSH_TTL_SECONDS));
    expect(req.headers.Urgency).toBe('high');
    expect(req.headers.Topic).toBe('abc');
    expect(req.headers.Authorization).toMatch(/^vapid t=/);
    expect(req.body?.byteLength).toBeGreaterThan(0);
    // Encrypted: the plaintext title is not in the body.
    expect(Buffer.from(req.body!).toString()).not.toContain('Pay rent');
  });
});

describe('createPushSender', () => {
  const target = { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a' };
  const req = { method: 'POST', endpoint: target.endpoint, headers: {}, body: null };

  it('classifies the guarded post', async () => {
    const safePush = vi.fn().mockResolvedValue({ status: 410, ms: 3, error: null });
    const sender = createPushSender({ build: () => req, safePush });
    expect(await sender.send(target, message)).toEqual({ kind: 'gone', code: 'http_410' });
    expect(safePush).toHaveBeenCalledWith(req);
  });

  it('treats keys that cannot be encrypted to as a gone device, without posting', async () => {
    const safePush = vi.fn();
    const sender = createPushSender({
      build: () => {
        throw new Error('bad key');
      },
      safePush,
    });
    expect(await sender.send(target, message)).toEqual({
      kind: 'gone',
      code: 'bad_subscription',
    });
    expect(safePush).not.toHaveBeenCalled();
  });
});
