import { reminderDismissers, type DismisserMember } from '@gobbit/shared/reminders';
import type { CategoryVisibility } from '@gobbit/shared';
import type { DecisionLogger } from '../lib/decision-event';
import type { Mailer } from '../mail/mailer';
import type { PushSender } from '../push/push-sender';
import type {
  ClaimedDelivery,
  ClaimedReminder,
  DeliveryInsert,
  NotificationsRepo,
  PlanningRepo,
} from '../repositories/notifications.repo';
import type { PushSubscriptionsRepo } from '../repositories/push-subscriptions.repo';
import type { NotifyDecisions } from './notify.events';
import {
  reminderEmail,
  reminderPushMessage,
  retryDelayMs,
  type ReminderNotice,
} from './notify.message';
import { storedPayload } from './reminders.service';

export interface NotifyLimits {
  batch: number;
  maxAttempts: number;
  retryBaseSeconds: number;
}

/** Deliveries sent at the same time within one tick (push services answer in ~100 ms). */
const SEND_CONCURRENCY = 5;

type PlannedEvent = {
  outcome: 'planned' | 'skipped';
  reason?: 'opted_out' | 'no_channel' | 'ineligible';
  itemId: string;
  userId: string;
  channels?: string;
};

type DeliveryEnd =
  | { status: 'sent' }
  | { status: 'retry'; code: string }
  | { status: 'failed'; code: string }
  | { status: 'gone'; code: string };

async function eachLimited<T>(list: readonly T[], limit: number, fn: (v: T) => Promise<void>) {
  let next = 0;
  const run = async () => {
    while (next < list.length) await fn(list[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
}

/**
 * 037 notifications (D295–D297). `plan` claims due reminders and records one delivery per person ×
 * channel × deadline in one transaction; `deliver` claims each delivery (`sending`) before the send,
 * so a crash mid-send leaves it `interrupted`, never sent twice. People are those who may dismiss
 * the reminder (same rule as the dismiss check, D293).
 */
export function createNotifyService(deps: {
  notifications: NotificationsRepo;
  pushSubscriptions: Pick<PushSubscriptionsRepo, 'findById' | 'deleteById' | 'touch'>;
  mailer: Mailer;
  /** Null when push isn't configured (no VAPID env): no push deliveries are planned. */
  push: PushSender | null;
  limits: NotifyLimits;
  appUrl: string;
  decisions: DecisionLogger<NotifyDecisions>;
  logError?: (err: unknown, deliveryId: string) => void;
  now?: () => Date;
}) {
  const { notifications, pushSubscriptions, mailer, push, limits, decisions } = deps;
  const now = deps.now ?? (() => new Date());

  async function planOne(
    repo: PlanningRepo,
    claimed: ClaimedReminder,
    ctx: { personal: boolean; members: DismisserMember[] },
    visibilities: CategoryVisibility[],
  ): Promise<{ rows: DeliveryInsert[]; events: PlannedEvent[] }> {
    const { item, deadline } = claimed;
    const payload = storedPayload(item);
    const dismissers = reminderDismissers({
      mode: payload.dismiss.mode,
      userIds: payload.dismiss.userIds,
      createdBy: item.createdBy,
      members: ctx.members,
      categoryVisibilities: visibilities,
      personalDeck: ctx.personal,
    });
    const events: PlannedEvent[] = [];
    const rows: DeliveryInsert[] = [];
    const chosen = new Set(dismissers);
    if (!ctx.personal && payload.dismiss.mode === 'people') {
      for (const userId of payload.dismiss.userIds) {
        if (!chosen.has(userId)) {
          events.push({ outcome: 'skipped', reason: 'ineligible', itemId: item.id, userId });
        }
      }
    }
    const recipients = await repo.recipients(dismissers);
    for (const userId of dismissers) {
      const person = recipients.get(userId);
      if (!person) {
        events.push({ outcome: 'skipped', reason: 'ineligible', itemId: item.id, userId });
        continue;
      }
      const base = { itemId: item.id, deadline, userId };
      const mine: DeliveryInsert[] = [];
      if (person.reminderEmails) mine.push({ ...base, channel: 'email', target: 'email' });
      if (push) {
        for (const id of person.pushTargetIds) mine.push({ ...base, channel: 'push', target: id });
      }
      if (mine.length === 0) {
        const reason = person.reminderEmails ? 'no_channel' : 'opted_out';
        events.push({ outcome: 'skipped', reason, itemId: item.id, userId });
        continue;
      }
      rows.push(...mine);
      const channels = [...new Set(mine.map((m) => m.channel))].join(',');
      events.push({ outcome: 'planned', itemId: item.id, userId, channels });
    }
    return { rows, events };
  }

  /** D295: one transaction; events are written after it commits. */
  async function plan(jobId: string): Promise<{ reminders: number; deliveries: number }> {
    const result = await notifications.planInTransaction(async (repo) => {
      const claimed = await repo.claimDue(limits.batch);
      if (claimed.length === 0) return { reminders: 0, deliveries: 0, events: [] };
      const visibilities = await repo.categoryVisibilities(claimed.map((c) => c.item.id));
      const contexts = new Map<string, Awaited<ReturnType<PlanningRepo['deckContext']>>>();
      const rows: DeliveryInsert[] = [];
      const events: PlannedEvent[] = [];
      for (const c of claimed) {
        let ctx = contexts.get(c.item.deckId);
        if (!ctx) {
          ctx = await repo.deckContext(c.item.deckId);
          contexts.set(c.item.deckId, ctx);
        }
        const planned = await planOne(repo, c, ctx, visibilities.get(c.item.id) ?? []);
        rows.push(...planned.rows);
        events.push(...planned.events);
      }
      const deliveries = await repo.insertDeliveries(rows);
      return { reminders: claimed.length, deliveries, events };
    });
    for (const e of result.events) decisions.record('reminder.notify', { ...e, jobId });
    return { reminders: result.reminders, deliveries: result.deliveries };
  }

  async function send(
    d: ClaimedDelivery,
    notice: ReminderNotice,
    email: string,
  ): Promise<DeliveryEnd> {
    if (d.channel === 'email') {
      try {
        // D295: Resend drops a second send with the same key if a retry overlaps a slow success.
        await mailer.send({
          ...reminderEmail(notice, deps.appUrl),
          to: email,
          idempotencyKey: `reminder-${d.id}`,
        });
        return { status: 'sent' };
      } catch {
        return { status: 'retry', code: 'mail_error' };
      }
    }
    if (!push) return { status: 'failed', code: 'push_disabled' };
    const device = await pushSubscriptions.findById(d.target);
    if (!device) return { status: 'gone', code: 'device_missing' };
    const outcome = await push.send(device, reminderPushMessage(notice));
    if (outcome.kind === 'sent') {
      await pushSubscriptions.touch(device.id);
      return { status: 'sent' };
    }
    if (outcome.kind === 'gone') await pushSubscriptions.deleteById(device.id);
    return { status: outcome.kind, code: outcome.code };
  }

  async function deliverOne(id: string, jobId: string): Promise<void> {
    const d = await notifications.claim(id);
    if (!d) return;
    const subject = {
      jobId,
      deliveryId: d.id,
      itemId: d.itemId,
      userId: d.userId,
      channel: d.channel,
    };
    const ctx = await notifications.context(d);
    if (!ctx?.stillDue) {
      await notifications.finish(d.id, { status: 'failed', error: 'stale' });
      decisions.record('reminder.notify', { ...subject, outcome: 'dropped', reason: 'stale' });
      return;
    }
    const timeZone = typeof ctx.payload.timeZone === 'string' ? ctx.payload.timeZone : 'UTC';
    const notice = {
      itemId: d.itemId,
      title: ctx.title,
      deckName: ctx.deckName,
      deadline: d.deadline,
      timeZone,
    };
    const end = await send(d, notice, ctx.email);

    if (end.status === 'sent') {
      await notifications.finish(d.id, { status: 'sent', error: null });
      decisions.record('reminder.notify', { ...subject, outcome: 'sent', attempts: d.attempts });
    } else if (end.status === 'retry' && d.attempts < limits.maxAttempts) {
      const retryAt = new Date(now().getTime() + retryDelayMs(d.attempts, limits.retryBaseSeconds));
      await notifications.finish(d.id, { status: 'pending', error: end.code, retryAt });
      decisions.record('reminder.notify', {
        ...subject,
        outcome: 'retried',
        reason: end.code,
        attempts: d.attempts,
      });
    } else if (end.status === 'gone') {
      await notifications.finish(d.id, { status: 'gone', error: end.code });
      decisions.record('reminder.notify', { ...subject, outcome: 'gone', reason: end.code });
    } else {
      const reason = end.status === 'retry' ? 'max_attempts' : end.code;
      await notifications.finish(d.id, { status: 'failed', error: end.code });
      decisions.record('reminder.notify', {
        ...subject,
        outcome: 'failed',
        reason,
        attempts: d.attempts,
      });
    }
  }

  /** Marks cut-off sends, then works through due deliveries (a few at a time). */
  async function deliver(jobId: string): Promise<{ attempted: number; interrupted: number }> {
    const cut = await notifications.markInterrupted();
    for (const d of cut) {
      decisions.record('reminder.notify', {
        jobId,
        deliveryId: d.id,
        itemId: d.itemId,
        userId: d.userId,
        channel: d.channel,
        outcome: 'interrupted',
      });
    }
    const ids = await notifications.duePending(limits.batch);
    await eachLimited(ids, SEND_CONCURRENCY, async (id) => {
      try {
        await deliverOne(id, jobId);
      } catch (err) {
        // The row stays `sending` and is marked `interrupted` on a later tick (at most once).
        deps.logError?.(err, id);
      }
    });
    return { attempted: ids.length, interrupted: cut.length };
  }

  return {
    plan,
    deliver,
    /** One sweep tick: plan what became due, then send what is due. */
    async tick(jobId: string) {
      const planned = await plan(jobId);
      const delivered = await deliver(jobId);
      return { ...planned, ...delivered };
    },
  };
}

export type NotifyService = ReturnType<typeof createNotifyService>;
