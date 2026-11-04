import webpush from 'web-push';
import type { PushMessage } from '@gobbit/shared';
import type { Env } from '../env';
import type { PushRequest, SafePush } from '../fetch/safe-fetch';

/** D296: VAPID identity; null when push isn't configured. */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFrom(
  env: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

/** A stored device subscription. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * D296: what a send means for the delivery row. `gone` deletes the subscription (404/410);
 * `retry` is a blip (429, 5xx, timeout, network); `failed` will not get better (other answers).
 */
export type PushOutcome =
  | { kind: 'sent' }
  | { kind: 'gone'; code: string }
  | { kind: 'retry'; code: string }
  | { kind: 'failed'; code: string };

/** D296: a missed reminder is stale after a day; the push service may drop it then. */
export const PUSH_TTL_SECONDS = 86_400;

/** RFC 8030 `Topic`: ≤ 32 base64url characters; a newer message with the same topic replaces it. */
export function pushTopic(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

/** Maps the push service's answer (or the guard's error) to an outcome. */
export function classifyPush(status: number | null, error: string | null): PushOutcome {
  if (status === null) {
    const code = error ?? 'fetch_failed';
    // A refused host or address won't change on retry.
    return code === 'blocked' || code === 'host_not_allowed'
      ? { kind: 'failed', code }
      : { kind: 'retry', code };
  }
  if (status >= 200 && status < 300) return { kind: 'sent' };
  const code = `http_${status}`;
  if (status === 404 || status === 410) return { kind: 'gone', code };
  if (status === 429 || status >= 500) return { kind: 'retry', code };
  return { kind: 'failed', code };
}

export type BuildPushRequest = (target: PushTarget, message: PushMessage) => PushRequest;

/** D296: `web-push` signs (VAPID) and encrypts (RFC 8291); we only build the request with it. */
export function createPushRequestBuilder(vapid: VapidConfig): BuildPushRequest {
  return (target, message) => {
    const details = webpush.generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      {
        vapidDetails: vapid,
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
        topic: pushTopic(message.tag),
      },
    );
    return {
      method: details.method,
      endpoint: details.endpoint,
      headers: Object.fromEntries(Object.entries(details.headers).map(([k, v]) => [k, String(v)])),
      body: details.body ? new Uint8Array(details.body) : null,
    };
  };
}

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushOutcome>;
}

/** D296: builds the request, posts it through `safe-push` and classifies the answer. */
export function createPushSender(deps: {
  build: BuildPushRequest;
  safePush: SafePush;
}): PushSender {
  return {
    async send(target, message) {
      let req: PushRequest;
      try {
        req = deps.build(target, message);
      } catch {
        // Bad stored keys: nothing can ever be encrypted to this device, so drop it.
        return { kind: 'gone', code: 'bad_subscription' };
      }
      const res = await deps.safePush(req);
      return classifyPush(res.status, res.error);
    },
  };
}
