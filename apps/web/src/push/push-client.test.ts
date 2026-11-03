import { describe, expect, it, vi } from 'vitest';
import {
  disablePush,
  enablePush,
  forgetPushOnSignOut,
  PushPermissionDenied,
  subscriptionBody,
  type PushClientDeps,
} from './push-client';

const UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

function fakeSubscription() {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'BPk', auth: 'au' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

function deps(over: Partial<PushClientDeps> = {}, existing = fakeSubscription()) {
  const created = fakeSubscription();
  const pushManager = {
    subscribe: vi.fn(async () => created),
    getSubscription: vi.fn(async () => existing),
  };
  const registration = { pushManager } as unknown as ServiceWorkerRegistration;
  const d: PushClientDeps = {
    registration: async () => registration,
    existingRegistration: async () => registration,
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
    userAgent: UA,
    save: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    ...over,
  };
  return { d, pushManager, created, existing };
}

describe('subscriptionBody', () => {
  it('maps toJSON() and adds a device label', () => {
    expect(subscriptionBody(fakeSubscription().toJSON(), UA)).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: 'BPk', auth: 'au' },
      label: 'Chrome on Android',
    });
  });

  it('refuses a subscription without keys', () => {
    expect(() => subscriptionBody({ endpoint: ENDPOINT }, UA)).toThrow(/without keys/);
  });
});

describe('enablePush (037, D297)', () => {
  it('subscribes with the VAPID key and registers the device', async () => {
    const { d, pushManager } = deps();
    await enablePush(d, 'AQID');
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT }));
  });

  it('stops when permission is not granted', async () => {
    const { d, pushManager } = deps({ requestPermission: async () => 'denied' });
    await expect(enablePush(d, 'AQID')).rejects.toBeInstanceOf(PushPermissionDenied);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('drops the browser subscription again when the server refuses it', async () => {
    const { d, created } = deps({ save: async () => Promise.reject(new Error('400')) });
    await expect(enablePush(d, 'AQID')).rejects.toThrow('400');
    expect(created.unsubscribe).toHaveBeenCalled();
  });
});

describe('disablePush', () => {
  it('forgets the device on the server, then in the browser', async () => {
    const { d, existing } = deps();
    await disablePush(d);
    expect(d.remove).toHaveBeenCalledWith(ENDPOINT);
    expect(existing.unsubscribe).toHaveBeenCalled();
  });

  it('does nothing without a subscription', async () => {
    const { d } = deps({ existingRegistration: async () => undefined });
    await disablePush(d);
    expect(d.remove).not.toHaveBeenCalled();
  });
});

describe('forgetPushOnSignOut', () => {
  it('unsubscribes in the browser even when the server call fails', async () => {
    const { d, existing } = deps({ remove: async () => Promise.reject(new Error('offline')) });
    await expect(forgetPushOnSignOut(d)).rejects.toThrow('offline');
    expect(existing.unsubscribe).toHaveBeenCalled();
  });
});
