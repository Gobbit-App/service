import {
  PUSH_TEST_PER_HOUR,
  type NotificationPreferences,
  type PushSubscriptionInput,
  type PushTestResult,
} from '@gobbit/shared';
import { HttpError, notFound, unauthorized } from '../errors/http-errors';
import type { DecisionLogger } from '../lib/decision-event';
import { isAllowedPushEndpoint } from '../push/push-hosts';
import type { PushSender } from '../push/push-sender';
import type { PushSubscriptionsRepo } from '../repositories/push-subscriptions.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { RateLimitService } from './rate-limit.service';
import type { PushSubscriptionDecisions } from './notify.events';

/** D297: the endpoint isn't one of the known browser push services. */
export const PUSH_HOST_PROBLEM = '/problems/push-host-not-allowed';

/**
 * 037 (D297): the member's devices for push, the test notification and the reminder-email switch.
 * Only the signed-in member reads or changes their own; push routes answer 404 when push isn't
 * configured.
 */
export function createPushSubscriptionsService(deps: {
  subscriptions: PushSubscriptionsRepo;
  users: Pick<UsersRepo, 'findReminderEmails' | 'setReminderEmails'>;
  push: PushSender | null;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  decisions: DecisionLogger<PushSubscriptionDecisions>;
}) {
  const { subscriptions, users, push, rateLimits, decisions } = deps;

  function requirePush(): PushSender {
    if (!push) throw notFound('Push notifications are not enabled');
    return push;
  }

  return {
    async add(userId: string, input: PushSubscriptionInput, ctx: { requestId: string }) {
      requirePush();
      if (!isAllowedPushEndpoint(input.endpoint)) {
        decisions.record('push.subscription', {
          outcome: 'refused',
          reason: 'host_not_allowed',
          userId,
          requestId: ctx.requestId,
        });
        throw new HttpError(
          400,
          PUSH_HOST_PROBLEM,
          'Push endpoint not allowed',
          'This browser push service is not supported',
        );
      }
      const { id, created } = await subscriptions.upsert({
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label: input.label ?? null,
      });
      decisions.record('push.subscription', {
        outcome: 'added',
        ...(created ? {} : { reason: 'refreshed' as const }),
        userId,
        subscriptionId: id,
        requestId: ctx.requestId,
      });
    },

    /** Idempotent: removing an unknown endpoint is not an error (the device may be gone already). */
    async remove(userId: string, endpoint: string, ctx: { requestId: string }) {
      requirePush();
      if (await subscriptions.removeForUser(userId, endpoint)) {
        decisions.record('push.subscription', {
          outcome: 'removed',
          userId,
          requestId: ctx.requestId,
        });
      }
    },

    /** D297: sends a test notice to each of the caller's devices; gone devices are removed. */
    async test(userId: string): Promise<PushTestResult> {
      const sender = requirePush();
      await rateLimits.enforce(`push-test:${userId}`, PUSH_TEST_PER_HOUR);
      const devices = await subscriptions.listForUser(userId);
      let sent = 0;
      for (const device of devices) {
        const outcome = await sender.send(device, {
          title: 'Gobbit test notification',
          body: 'Reminders will show up like this.',
          url: '/settings',
          tag: 'gobbit-test',
        });
        if (outcome.kind === 'sent') sent += 1;
        if (outcome.kind === 'gone') await subscriptions.deleteById(device.id);
      }
      return { devices: sent };
    },

    async preferences(userId: string): Promise<NotificationPreferences> {
      const reminderEmails = await users.findReminderEmails(userId);
      if (reminderEmails === null) throw unauthorized('The signed-in user no longer exists');
      return { reminderEmails };
    },

    async setPreferences(
      userId: string,
      input: NotificationPreferences,
    ): Promise<NotificationPreferences> {
      const previous = await users.setReminderEmails(userId, input.reminderEmails);
      if (previous === null) throw unauthorized('The signed-in user no longer exists');
      return { reminderEmails: input.reminderEmails };
    },
  };
}

export type PushSubscriptionsService = ReturnType<typeof createPushSubscriptionsService>;
