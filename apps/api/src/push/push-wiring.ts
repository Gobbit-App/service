import type { Db } from '@gobbit/db';
import type { Env } from '../env';
import { createSafePush } from '../fetch/safe-fetch';
import { decisionLogger } from '../lib/decision-event';
import type { Logger } from '../lib/logger';
import type { Mailer } from '../mail/mailer';
import { createNotificationsRepo } from '../repositories/notifications.repo';
import { createPushSubscriptionsRepo } from '../repositories/push-subscriptions.repo';
import { NOTIFY_DECISION_LEVELS, type NotifyDecisions } from '../services/notify.events';
import { createNotifyService } from '../services/notify.service';
import { isAllowedPushHost } from './push-hosts';
import {
  createPushRequestBuilder,
  createPushSender,
  vapidFrom,
  type PushSender,
} from './push-sender';

type PushEnv = Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>;

/**
 * D296: the production push sender (VAPID + guarded post to allow-listed hosts), or null when the
 * VAPID env is absent. `override` (tests) wins, including an explicit null.
 */
export function resolvePushSender(env: PushEnv, override?: PushSender | null): PushSender | null {
  if (override !== undefined) return override;
  const vapid = vapidFrom(env);
  if (!vapid) return null;
  return createPushSender({
    build: createPushRequestBuilder(vapid),
    safePush: createSafePush({ isAllowedHost: isAllowedPushHost }),
  });
}

/** The reminder sweep's service (worker and integration tests). */
export function buildNotifyService(deps: {
  db: Db;
  env: Pick<
    Env,
    | 'API_URL'
    | 'APP_URL'
    | 'NOTIFY_MAX_ATTEMPTS'
    | 'NOTIFY_RETRY_BASE_SECONDS'
    | 'REMINDER_SWEEP_BATCH'
  > &
    PushEnv;
  mailer: Mailer;
  push?: PushSender | null;
  logger?: Logger;
  now?: () => Date;
}) {
  const { db, env } = deps;
  return createNotifyService({
    notifications: createNotificationsRepo(db),
    pushSubscriptions: createPushSubscriptionsRepo(db),
    mailer: deps.mailer,
    push: resolvePushSender(env, deps.push),
    limits: {
      batch: env.REMINDER_SWEEP_BATCH,
      maxAttempts: env.NOTIFY_MAX_ATTEMPTS,
      retryBaseSeconds: env.NOTIFY_RETRY_BASE_SECONDS,
    },
    appUrl: env.APP_URL ?? env.API_URL,
    decisions: decisionLogger<NotifyDecisions>('notify', {
      parent: deps.logger,
      levels: NOTIFY_DECISION_LEVELS,
    }),
    logError: (err, deliveryId) =>
      deps.logger?.error({ err, deliveryId }, 'reminder delivery failed'),
    now: deps.now,
  });
}
