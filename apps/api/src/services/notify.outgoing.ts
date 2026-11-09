import type { PushMessage } from '@gobbit/shared';
import type { RenderedMail } from '../mail/templates';
import type { ClaimedDelivery, NotificationsRepo } from '../repositories/notifications.repo';
import { audienceOf } from './notify.event-plan';
import { eventPushMessage, reminderEmail, reminderPushMessage } from './notify.message';

/** What one claimed delivery sends, once it is known to be still due. */
export interface Outgoing {
  push: PushMessage;
  /** Reminders only: event notices are push only (FR-017). */
  email?: RenderedMail;
  to: string;
}

type Reads = Pick<
  NotificationsRepo,
  'context' | 'eventFacts' | 'deckContext' | 'categoryVisibilities'
>;

/** D295: a reminder delivery's message, or null once it is no longer due. */
export async function reminderOutgoing(
  reads: Reads,
  d: ClaimedDelivery,
  appUrl: string,
): Promise<Outgoing | null> {
  const ctx = await reads.context(d);
  if (!ctx?.stillDue) return null;
  const timeZone = typeof ctx.payload.timeZone === 'string' ? ctx.payload.timeZone : 'UTC';
  const notice = {
    itemId: d.itemId,
    title: ctx.title,
    deckName: ctx.deckName,
    deadline: d.deadline,
    timeZone,
  };
  return {
    push: reminderPushMessage(notice),
    email: reminderEmail(notice, appUrl),
    to: ctx.email,
  };
}

/**
 * D361: an event delivery's message, or null unless the notice is still for the current start of
 * a published, live card and the person is still in its audience and hasn't muted it.
 */
export async function eventOutgoing(reads: Reads, d: ClaimedDelivery): Promise<Outgoing | null> {
  if (d.noticeId === null) return null;
  const facts = await reads.eventFacts(d);
  if (!facts?.live || facts.muted) return null;
  const [ctx, visibilities] = await Promise.all([
    reads.deckContext(facts.deckId),
    reads.categoryVisibilities([d.itemId]),
  ]);
  const audience = audienceOf(facts, ctx, visibilities.get(d.itemId) ?? []);
  if (!audience.includes(d.userId)) return null;
  const location = typeof facts.payload.location === 'string' ? facts.payload.location : undefined;
  return {
    push: eventPushMessage({
      itemId: d.itemId,
      noticeId: d.noticeId,
      title: facts.title,
      deckName: facts.deckName,
      startsAt: facts.startsAt,
      allDay: facts.allDay,
      timeZone: facts.timeZone,
      location,
    }),
    to: facts.email,
  };
}
