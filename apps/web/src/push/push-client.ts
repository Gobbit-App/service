import type { PushSubscriptionInput } from '@gobbit/shared/reminders';
import { removePushSubscription, savePushSubscription } from '../api/notifications';
import { applicationServerKey, deviceLabel } from './push-support';

/** What the push client needs from the browser and the API (injected in tests). */
export type PushClientDeps = {
  /** The active service worker registration (`navigator.serviceWorker.ready`); waits for one. */
  registration: () => Promise<Pick<ServiceWorkerRegistration, 'pushManager'>>;
  /** The registration if there is one now; never waits (`ready` hangs without a worker). */
  existingRegistration: () => Promise<Pick<ServiceWorkerRegistration, 'pushManager'> | undefined>;
  requestPermission: () => Promise<NotificationPermission>;
  userAgent: string;
  save: (body: PushSubscriptionInput) => Promise<unknown>;
  remove: (endpoint: string) => Promise<unknown>;
};

export const browserPushDeps = (): PushClientDeps => ({
  registration: () => navigator.serviceWorker.ready,
  existingRegistration: async () =>
    'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : undefined,
  requestPermission: () => Notification.requestPermission(),
  userAgent: navigator.userAgent,
  save: savePushSubscription,
  remove: removePushSubscription,
});

export class PushPermissionDenied extends Error {
  constructor() {
    super('Notification permission was not granted');
    this.name = 'PushPermissionDenied';
  }
}

/** `PushSubscription.toJSON()` → the API body; throws when the browser gave no keys. */
export function subscriptionBody(
  subscription: PushSubscriptionJSON,
  userAgent: string,
): PushSubscriptionInput {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('The browser returned a push subscription without keys');
  }
  const label = deviceLabel(userAgent);
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, ...(label ? { label } : {}) };
}

/** This device's current subscription, if any. */
export async function currentSubscription(deps: PushClientDeps): Promise<PushSubscription | null> {
  const registration = await deps.existingRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Asks for permission (from a click), subscribes with the server's VAPID key and registers the
 * device. If the server refuses, the browser subscription is dropped again so the two agree.
 */
export async function enablePush(deps: PushClientDeps, publicKey: string): Promise<void> {
  const permission = await deps.requestPermission();
  if (permission !== 'granted') throw new PushPermissionDenied();
  const registration = await deps.registration();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  try {
    await deps.save(subscriptionBody(subscription.toJSON(), deps.userAgent));
  } catch (err) {
    await subscription.unsubscribe().catch(() => false);
    throw err;
  }
}

/** Forgets this device on the server first (needs the session), then in the browser. */
export async function disablePush(deps: PushClientDeps): Promise<void> {
  const subscription = await currentSubscription(deps);
  if (!subscription) return;
  await deps.remove(subscription.endpoint);
  await subscription.unsubscribe();
}

/**
 * Sign-out: the next person on this phone must not get the previous member's reminders. Best
 * effort — the browser subscription is dropped even when the server call fails (offline), which
 * makes the push service answer 410 and the server forget it on the next send.
 */
export async function forgetPushOnSignOut(deps: PushClientDeps): Promise<void> {
  const subscription = await currentSubscription(deps);
  if (!subscription) return;
  try {
    await deps.remove(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}
