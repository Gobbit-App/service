import type { ItemRow } from '@gobbit/db';
import {
  can,
  codePointLength,
  type CategoryVisibility,
  type MemberRole,
  type ReminderState,
} from '@gobbit/shared';
import {
  canChangeDismissers,
  reminderDismissers,
  reminderPayloadSchema,
  showBeforeMs,
  type DismissReminder,
  type DismissRule,
  type DismisserMember,
  type ReminderPayload,
} from '@gobbit/shared/reminders';
import { HttpError, conflict, forbidden, unprocessableField } from '../errors/http-errors';
import type { DecisionLogger } from '../lib/decision-event';
import type { RemindersRepo } from '../repositories/reminders.repo';
import { eventFrom } from '../events/item-event';
import type { Actor, CurrentUser } from '../types';
import type { ReminderDecisions } from './reminders.events';

const DAY_MS = 86_400_000;

/** D293: only the creator (or an owner once the creator left) changes who can dismiss. */
export const REMINDER_DISMISSERS_PROBLEM = '/problems/reminder-dismissers';
/** D294: the caller isn't one of the people who may dismiss this reminder. */
export const NOT_A_DISMISSER_PROBLEM = '/problems/not-a-dismisser';
/** D131/D294: shared with items.service (kept here to avoid a runtime import cycle). */
const INVALID_TRANSITION = '/problems/invalid-transition';

/** D299: env-tunable limits (may only lower the shared caps). */
export interface ReminderLimits {
  maxDeadlineDays: number;
  maxShowBeforeDays: number;
  resolutionMax: number;
}

export interface ReminderWriteContext {
  actor: Actor;
  role: MemberRole;
  deck: { id: string; kind: string };
}

/** ADR-060: decision events correlate on the request; internal callers have none. */
function requestIdOf(actor: Actor): string {
  return actor.requestId ?? 'internal';
}

function sameRule(a: DismissRule, b: DismissRule): boolean {
  if (a.mode !== b.mode) return false;
  const ids = new Set(a.userIds);
  return a.userIds.length === b.userIds.length && b.userIds.every((id) => ids.has(id));
}

/** Stored payloads were validated on write; `userIds` may be absent on older shapes. */
/** The stored payload with `dismiss.userIds` always present (also read by notify.service). */
export function storedPayload(row: Pick<ItemRow, 'payload'>): ReminderPayload {
  const p = row.payload as ReminderPayload;
  return { ...p, dismiss: { mode: p.dismiss.mode, userIds: p.dismiss.userIds ?? [] } };
}

/**
 * 037 reminder rules (D291–D294): payload checks against the clock and the deck's writers, who may
 * dismiss, the dismiss itself and the `reminder` DTO field. Item loading and visibility stay in
 * items.service, which calls in here.
 */
export function createRemindersService(deps: {
  reminders: Pick<
    RemindersRepo,
    'states' | 'deckContext' | 'deckMembers' | 'categoryVisibilities' | 'dismiss'
  >;
  limits: ReminderLimits;
  decisions: DecisionLogger<ReminderDecisions>;
  now?: () => Date;
}) {
  const { reminders, limits, decisions, now = () => new Date() } = deps;

  function refuse(
    event: 'reminder.dismissers',
    reason: ReminderDecisions['reminder.dismissers']['reason'],
    ctx: ReminderWriteContext,
    itemId: string | null,
  ): void {
    decisions.record(event, {
      outcome: 'refused',
      reason,
      requestId: requestIdOf(ctx.actor),
      userId: ctx.actor.user.id,
      deckId: ctx.deck.id,
      itemId,
    });
  }

  function assertDeadline(payload: ReminderPayload): void {
    const deadline = Date.parse(payload.deadline);
    const at = now().getTime();
    if (deadline <= at) {
      throw unprocessableField('payload.deadline', 'The deadline must be in the future');
    }
    if (deadline > at + limits.maxDeadlineDays * DAY_MS) {
      throw unprocessableField(
        'payload.deadline',
        `The deadline can be at most ${limits.maxDeadlineDays} days ahead`,
      );
    }
  }

  async function dismissersOf(
    row: ItemRow,
    ctx: { personal: boolean; members: DismisserMember[] },
    visibilities: Map<string, CategoryVisibility[]>,
  ): Promise<string[]> {
    const payload = storedPayload(row);
    return reminderDismissers({
      mode: payload.dismiss.mode,
      userIds: payload.dismiss.userIds,
      createdBy: row.createdBy,
      members: ctx.members,
      categoryVisibilities: visibilities.get(row.id) ?? [],
      personalDeck: ctx.personal,
    });
  }

  return {
    /**
     * D291/D293/D299: checks a reminder payload on create (`before` absent) or update and returns
     * what to store. A new or changed deadline must be in the future and not too far; the people
     * picked must be writers; only the creator (or an owner once the creator left) changes the
     * rule; personal decks always store `me`.
     */
    async checkPayload(
      ctx: ReminderWriteContext,
      input: unknown,
      before?: { item: ItemRow },
    ): Promise<ReminderPayload> {
      const payload = reminderPayloadSchema.parse(input);
      const previous = before ? storedPayload(before.item) : null;

      if (!previous || Date.parse(previous.deadline) !== Date.parse(payload.deadline)) {
        assertDeadline(payload);
      }
      if (showBeforeMs(payload.showBefore) > limits.maxShowBeforeDays * DAY_MS) {
        throw unprocessableField(
          'payload.showBefore.amount',
          `Show before can be at most ${limits.maxShowBeforeDays} days`,
        );
      }

      if (ctx.deck.kind === 'personal') {
        return { ...payload, dismiss: { mode: 'me', userIds: [] } };
      }

      const ruleChanged = previous !== null && !sameRule(previous.dismiss, payload.dismiss);
      if (!previous || ruleChanged) {
        const members = await reminders.deckMembers(ctx.deck.id);
        if (ruleChanged && before) {
          const createdBy = before.item.createdBy;
          const allowed = canChangeDismissers({
            userId: ctx.actor.user.id,
            role: ctx.role,
            createdBy,
            creatorIsMember: members.some((m) => m.userId === createdBy),
          });
          if (!allowed) {
            refuse('reminder.dismissers', 'not_creator', ctx, before.item.id);
            throw new HttpError(
              403,
              REMINDER_DISMISSERS_PROBLEM,
              'Forbidden',
              'Only the person who created this reminder can change who can dismiss it',
            );
          }
        }
        if (payload.dismiss.mode === 'people') {
          const writers = new Set(
            members.filter((m) => can(m.role, 'item.update')).map((m) => m.userId),
          );
          if (payload.dismiss.userIds.some((id) => !writers.has(id))) {
            refuse('reminder.dismissers', 'not_writer', ctx, before?.item.id ?? null);
            throw unprocessableField(
              'payload.dismiss.userIds',
              'Only people who can edit cards in this deck can be picked',
            );
          }
        }
      }
      return payload;
    },

    /** D291: the `reminder` DTO field for each reminder row, as `user` sees it. */
    async states(
      user: CurrentUser,
      rows: ItemRow[],
      role: MemberRole,
    ): Promise<Map<string, ReminderState>> {
      const result = new Map<string, ReminderState>();
      const reminderRows = rows.filter((r) => r.type === 'reminder' && r.revealAt);
      if (reminderRows.length === 0) return result;

      const ids = reminderRows.map((r) => r.id);
      const [states, visibilities] = await Promise.all([
        reminders.states(ids),
        reminders.categoryVisibilities(ids),
      ]);
      const contexts = new Map<string, Awaited<ReturnType<RemindersRepo['deckContext']>>>();
      for (const deckId of new Set(reminderRows.map((r) => r.deckId))) {
        contexts.set(deckId, await reminders.deckContext(deckId));
      }

      const at = now().getTime();
      for (const row of reminderRows) {
        const state = states.get(row.id);
        const ctx = contexts.get(row.deckId);
        if (!state || !ctx || !row.revealAt) continue;
        const dismissers = await dismissersOf(row, ctx, visibilities);
        const pending = state.outcome === 'pending';
        result.set(row.id, {
          deadline: state.deadline.toISOString(),
          revealAt: row.revealAt.toISOString(),
          timeZone: storedPayload(row).timeZone,
          state: state.outcome,
          dismissedBy: state.dismissedBy,
          dismissedAt: state.dismissedAt?.toISOString() ?? null,
          resolution: state.resolution,
          hidden: row.revealAt.getTime() > at,
          canDismiss:
            pending &&
            row.status !== 'proposed' &&
            row.deletedAt === null &&
            dismissers.includes(user.id),
          canChangeDismissers:
            !ctx.personal &&
            can(role, 'item.update') &&
            canChangeDismissers({
              userId: user.id,
              role,
              createdBy: row.createdBy,
              creatorIsMember: ctx.members.some((m) => m.userId === row.createdBy),
            }),
        });
      }
      return result;
    },

    /**
     * D294: an eligible dismisser closes a pending reminder: outcome, archive and activity event
     * in one transaction. 409 when it isn't a pending, live reminder; 403 when the caller may not.
     */
    async dismiss(actor: Actor, item: ItemRow, input: DismissReminder): Promise<ItemRow> {
      const record = (
        outcome: 'accepted' | 'refused',
        reason: ReminderDecisions['reminder.dismiss']['reason'],
      ) =>
        decisions.record('reminder.dismiss', {
          outcome,
          reason,
          requestId: requestIdOf(actor),
          userId: actor.user.id,
          deckId: item.deckId,
          itemId: item.id,
        });

      if (item.type !== 'reminder' || item.status === 'proposed') {
        throw conflict('Only a published reminder can be dismissed', INVALID_TRANSITION);
      }
      const resolution = input.resolution?.trim() || null;
      if (resolution !== null && codePointLength(resolution) > limits.resolutionMax) {
        throw unprocessableField(
          'resolution',
          `Resolution must be at most ${limits.resolutionMax} characters`,
        );
      }

      const state = (await reminders.states([item.id])).get(item.id);
      if (!state || state.outcome !== 'pending') {
        record('refused', 'not_pending');
        throw conflict('This reminder was already dismissed', INVALID_TRANSITION);
      }

      const [ctx, visibilities] = await Promise.all([
        reminders.deckContext(item.deckId),
        reminders.categoryVisibilities([item.id]),
      ]);
      if (!(await dismissersOf(item, ctx, visibilities)).includes(actor.user.id)) {
        record('refused', 'not_eligible');
        throw new HttpError(
          403,
          NOT_A_DISMISSER_PROBLEM,
          'Forbidden',
          "You aren't one of the people who can dismiss this reminder",
        );
      }

      const outcome = input.done ? 'done' : 'dismissed';
      const row = await reminders.dismiss(item.id, { outcome, by: actor.user.id, resolution }, [
        eventFrom(actor, input.done ? 'completed' : 'dismissed'),
      ]);
      if (!row) {
        record('refused', 'not_pending');
        throw conflict('This reminder was already dismissed', INVALID_TRANSITION);
      }
      record('accepted', outcome);
      return row;
    },

    /**
     * D293: editors may delete reminders they created; everything else needs `item.delete`.
     * Throws the usual 403 otherwise.
     */
    assertCanDelete(
      actor: Actor,
      item: Pick<ItemRow, 'id' | 'deckId' | 'type' | 'createdBy'>,
      role: MemberRole,
    ): void {
      if (can(role, 'item.delete')) return;
      if (item.type === 'reminder') {
        const own = item.createdBy === actor.user.id && can(role, 'item.update');
        decisions.record('reminder.delete', {
          outcome: own ? 'accepted' : 'refused',
          reason: own ? 'creator' : 'not_creator',
          requestId: requestIdOf(actor),
          userId: actor.user.id,
          deckId: item.deckId,
          itemId: item.id,
        });
        if (own) return;
      }
      throw forbidden('item.delete', role);
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
