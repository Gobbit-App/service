import type { ItemRow } from '@gobbit/db';
import type { CategoryVisibility } from '@gobbit/shared';
import { eventAudience, type AudienceMember } from '@gobbit/shared/event-constants';
import type { ClaimedNotice } from '../repositories/event-notify.repo';
import type { DeliveryInsert, PlanningRepo, Recipient } from '../repositories/notifications.repo';
import { storedEventPayload } from './event-cards.service';
import type { NotifyDecisions } from './notify.events';

/** The deck facts the audience rule needs (D362). */
export interface AudienceContext {
  personal: boolean;
  members: readonly AudienceMember[];
}

export type EventNoticeRecord = NotifyDecisions['event.notice'] & {
  itemId: string;
  noticeId: string;
  userId?: string;
};

/** D362: who the event notifies right now, from its stored notify settings. */
export function audienceOf(
  item: Pick<ItemRow, 'payload' | 'createdBy'>,
  ctx: AudienceContext,
  visibilities: readonly CategoryVisibility[],
): string[] {
  const { audience } = storedEventPayload(item).notify;
  return eventAudience({
    mode: audience.mode,
    userIds: audience.userIds,
    createdBy: item.createdBy,
    members: ctx.members,
    categoryVisibilities: visibilities,
    personalDeck: ctx.personal,
  });
}

/**
 * D360: one push delivery per audience member × device. Muted people, people without a device,
 * people picked but no longer able to read the card and (without VAPID) everyone are skipped,
 * each with a record.
 */
export function planEventNotice(input: {
  claimed: ClaimedNotice;
  audience: readonly string[];
  ctx: AudienceContext;
  recipients: ReadonlyMap<string, Recipient>;
  muted: ReadonlySet<string>;
  pushOn: boolean;
}): { rows: DeliveryInsert[]; records: EventNoticeRecord[] } {
  const { claimed, audience, ctx, recipients, muted, pushOn } = input;
  const { item, noticeId, fireAt } = claimed;
  const subject = { itemId: item.id, noticeId };
  const rows: DeliveryInsert[] = [];
  const records: EventNoticeRecord[] = [{ ...subject, outcome: 'planned' }];

  const notify = storedEventPayload(item).notify;
  if (!ctx.personal && notify.audience.mode === 'people') {
    const kept = new Set(audience);
    for (const userId of notify.audience.userIds) {
      if (!kept.has(userId))
        records.push({ ...subject, userId, outcome: 'skipped', reason: 'ineligible' });
    }
  }

  for (const userId of audience) {
    const skip = (reason: EventNoticeRecord['reason']) =>
      records.push({ ...subject, userId, outcome: 'skipped', reason });
    const person = recipients.get(userId);
    if (!person) {
      skip('ineligible');
    } else if (muted.has(userId)) {
      skip('muted');
    } else if (!pushOn) {
      skip('push_off');
    } else if (person.pushTargetIds.length === 0) {
      skip('no_channel');
    } else {
      for (const target of person.pushTargetIds) {
        rows.push({
          itemId: item.id,
          kind: 'event',
          noticeId,
          deadline: fireAt,
          userId,
          channel: 'push',
          target,
        });
      }
    }
  }
  return { rows, records };
}

/**
 * D360: claims due notices (too-late ones become `skipped / started`) and fans each planned one out
 * to the event's current audience. Runs inside the planning transaction; the caller writes the
 * records after it commits.
 */
export async function planDueEvents(
  repo: PlanningRepo,
  opts: { batch: number; graceMinutes: number; pushOn: boolean },
): Promise<{ notices: number; rows: DeliveryInsert[]; records: EventNoticeRecord[] }> {
  const { planned, started } = await repo.claimDueNotices(opts.batch, opts.graceMinutes);
  const records: EventNoticeRecord[] = started.map((s) => ({
    ...s,
    outcome: 'skipped',
    reason: 'started',
  }));
  const rows: DeliveryInsert[] = [];
  if (planned.length === 0) return { notices: 0, rows, records };

  const visibilities = await repo.categoryVisibilities([...new Set(planned.map((c) => c.item.id))]);
  const contexts = new Map<string, AudienceContext>();
  for (const claimed of planned) {
    const { deckId, id } = claimed.item;
    let ctx = contexts.get(deckId);
    if (!ctx) {
      ctx = await repo.deckContext(deckId);
      contexts.set(deckId, ctx);
    }
    const audience = audienceOf(claimed.item, ctx, visibilities.get(id) ?? []);
    const plan = planEventNotice({
      claimed,
      audience,
      ctx,
      recipients: await repo.recipients(audience),
      muted: await repo.mutedAmong(id, audience),
      pushOn: opts.pushOn,
    });
    rows.push(...plan.rows);
    records.push(...plan.records);
  }
  return { notices: planned.length, rows, records };
}
