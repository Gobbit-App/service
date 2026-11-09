import type { ItemRow } from '@gobbit/db';
import { can, codePointLength, type CategoryVisibility, type MemberRole } from '@gobbit/shared';
import {
  EVENT_UNIT_MS,
  canEditEventNotify,
  eventAudience,
  eventNoticeMoments,
  eventSpan,
  notifyBeforeKey,
} from '@gobbit/shared/event-constants';
import {
  eventPayloadSchema,
  type EventNotify,
  type EventPayload,
  type EventState,
} from '@gobbit/shared/events-cards';
import { HttpError, conflict, unprocessableField } from '../errors/http-errors';
import type { DecisionLogger } from '../lib/decision-event';
import {
  syncNotices,
  type EventCardsRepo,
  type NoticeSkipReason,
} from '../repositories/event-cards.repo';
import type { InTx } from '../repositories/items.repo';
import type { RemindersRepo } from '../repositories/reminders.repo';
import type { Actor, CurrentUser } from '../types';
import type { EventCardDecisions } from './event-cards.events';

const DAY_MS = 86_400_000;

/** D363: someone other than the creator (or an owner once the creator left) changed `notify`. */
export const EVENT_NOTIFY_LOCKED_PROBLEM = '/problems/event-notify-locked';
/** D364: mute applies only to event cards. */
export const NOT_AN_EVENT_PROBLEM = '/problems/not-an-event';
/** D364: only people the event notifies can mute it. */
export const EVENT_NOT_IN_AUDIENCE_PROBLEM = '/problems/event-not-in-audience';
/** D363: `notify.audience.userIds` names someone who isn't a live member of the deck. */
export const EVENT_AUDIENCE_UNKNOWN_MEMBER_PROBLEM = '/problems/event-audience-unknown-member';
/** D12/042: a card's type never changes (in particular to or from `event`). */
export const TYPE_CHANGE_PROBLEM = '/problems/type-change-not-supported';

/** D371: env-tunable limits (may only lower the shared caps). */
export interface EventLimits {
  notifyTimesMax: number;
  notifyBeforeMaxDays: number;
  startMaxDays: number;
  locationMax: number;
  allDayNoticeHour: number;
}

export interface EventWriteContext {
  actor: Actor;
  role: MemberRole;
  deck: { id: string; kind: string };
}

/** What a checked event payload stores, and whether its notify settings changed. */
export interface CheckedEventPayload {
  payload: EventPayload;
  notifyChanged: boolean;
}

/** ADR-060: decision events correlate on the request; internal callers have none. */
function requestIdOf(actor: Actor): string {
  return actor.requestId ?? 'internal';
}

/** The stored payload (validated on write). */
export function storedEventPayload(row: Pick<ItemRow, 'payload'>): EventPayload {
  return row.payload as EventPayload;
}

/** D359: the notice sync for a write, run in the item's transaction; undefined for other types. */
export type EventNoticeHook = (
  item: Pick<ItemRow, 'id' | 'type'>,
  payload: Record<string, unknown>,
  reason: NoticeSkipReason,
) => InTx | undefined;

/**
 * D359: `payload` is what the card stores after the write; its moments replace the pending
 * notices and the ones already due are skipped with `reason`.
 */
export function createEventNoticeHook(opts: {
  allDayNoticeHour: number;
  now?: () => Date;
}): EventNoticeHook {
  const { allDayNoticeHour, now = () => new Date() } = opts;
  return (item, payload, reason) => {
    if (item.type !== 'event') return undefined;
    const moments = eventNoticeMoments(payload as EventPayload, { allDayNoticeHour });
    return (tx) => syncNotices(tx, item.id, moments, now(), reason);
  };
}

/** Same notify times (in any order) and the same audience. */
export function sameNotify(a: EventNotify, b: EventNotify): boolean {
  const keys = (n: EventNotify) => n.before.map(notifyBeforeKey).sort().join(',');
  const ids = (n: EventNotify) => [...n.audience.userIds].sort().join(',');
  return a.audience.mode === b.audience.mode && keys(a) === keys(b) && ids(a) === ids(b);
}

/**
 * 042 event rules (D358–D363): payload checks against the clock, the limits and the deck's members,
 * the notify lock, notice sync inside the item's transaction and the `event` DTO field. Item loading
 * and visibility stay in items.service, which calls in here.
 */
export function createEventCardsService(deps: {
  events: Pick<EventCardsRepo, 'spans' | 'currentNotices' | 'mutedBy' | 'setMute'>;
  members: Pick<RemindersRepo, 'deckMembers' | 'deckContext' | 'categoryVisibilities'>;
  limits: EventLimits;
  decisions: DecisionLogger<EventCardDecisions>;
  now?: () => Date;
}) {
  const { events, members, limits, decisions, now = () => new Date() } = deps;

  function refuseWrite(
    reason: EventCardDecisions['event.write']['reason'],
    ctx: EventWriteContext,
    itemId: string | null,
  ): void {
    decisions.record('event.write', {
      outcome: 'refused',
      reason,
      requestId: requestIdOf(ctx.actor),
      userId: ctx.actor.user.id,
      deckId: ctx.deck.id,
      itemId,
    });
  }

  function notifySettings(
    outcome: 'changed' | 'refused',
    ctx: EventWriteContext,
    itemId: string,
  ): void {
    decisions.record('event.notify_settings', {
      outcome,
      reason: outcome === 'changed' ? 'creator' : 'not_creator',
      requestId: requestIdOf(ctx.actor),
      userId: ctx.actor.user.id,
      deckId: ctx.deck.id,
      itemId,
    });
  }

  type DeckContext = Awaited<ReturnType<RemindersRepo['deckContext']>>;

  /** D362: whom the event notifies right now. */
  function audienceFor(row: ItemRow, ctx: DeckContext, visibilities: CategoryVisibility[]) {
    const payload = storedEventPayload(row);
    return eventAudience({
      mode: payload.notify.audience.mode,
      userIds: payload.notify.audience.userIds,
      createdBy: row.createdBy,
      members: ctx.members,
      categoryVisibilities: visibilities,
      personalDeck: ctx.personal,
    });
  }

  /** D371: the env limits on top of the schema's shared caps. */
  function assertLimits(
    payload: EventPayload,
    ctx: EventWriteContext,
    itemId: string | null,
    startChanged: boolean,
  ): void {
    const fail = (
      reason: EventCardDecisions['event.write']['reason'],
      path: string,
      message: string,
    ) => {
      refuseWrite(reason, ctx, itemId);
      return unprocessableField(path, message);
    };
    if (startChanged) {
      const { startsAt } = eventSpan(payload);
      if (startsAt.getTime() > now().getTime() + limits.startMaxDays * DAY_MS) {
        throw fail(
          'start_too_far',
          'payload.start',
          `The start can be at most ${limits.startMaxDays} days ahead`,
        );
      }
    }
    if (payload.location !== undefined && codePointLength(payload.location) > limits.locationMax) {
      throw fail(
        'location_too_long',
        'payload.location',
        `Location must be at most ${limits.locationMax} characters`,
      );
    }
    if (payload.notify.before.length > limits.notifyTimesMax) {
      throw fail(
        'too_many_times',
        'payload.notify.before',
        `At most ${limits.notifyTimesMax} notify times`,
      );
    }
    const maxMs = limits.notifyBeforeMaxDays * DAY_MS;
    if (payload.notify.before.some((b) => b.amount * EVENT_UNIT_MS[b.unit] > maxMs)) {
      throw fail(
        'before_too_long',
        'payload.notify.before',
        `Notify at most ${limits.notifyBeforeMaxDays} days before`,
      );
    }
  }

  return {
    /**
     * D356/D363/D371: checks an event payload on create (`before` absent) or update and returns what
     * to store. A new or moved start must be within the limit (a past one is fine); `people` must be
     * live members; only the creator (or an owner once the creator left) changes `notify` after the
     * first publish; personal decks always store `me`.
     */
    async checkPayload(
      ctx: EventWriteContext,
      input: unknown,
      before?: { item: ItemRow },
    ): Promise<CheckedEventPayload> {
      const parsed = eventPayloadSchema.parse(input);
      const payload: EventPayload =
        ctx.deck.kind === 'personal'
          ? { ...parsed, notify: { ...parsed.notify, audience: { mode: 'me', userIds: [] } } }
          : parsed;
      const previous = before ? storedEventPayload(before.item) : null;
      const itemId = before?.item.id ?? null;

      const startChanged =
        !previous ||
        eventSpan(previous).startsAt.getTime() !== eventSpan(payload).startsAt.getTime();
      assertLimits(payload, ctx, itemId, startChanged);

      const notifyChanged = previous !== null && !sameNotify(previous.notify, payload.notify);
      const audienceChanged =
        !previous ||
        !sameNotify(
          { before: [], audience: previous.notify.audience },
          { before: [], audience: payload.notify.audience },
        );
      const checkPeople = payload.notify.audience.mode === 'people' && audienceChanged;
      if (!notifyChanged && !checkPeople) return { payload, notifyChanged };

      const deckMembers = await members.deckMembers(ctx.deck.id);
      if (notifyChanged && before) {
        const createdBy = before.item.createdBy;
        const allowed = canEditEventNotify({
          userId: ctx.actor.user.id,
          role: ctx.role,
          createdBy,
          creatorIsMember: deckMembers.some((m) => m.userId === createdBy),
          status: before.item.status,
        });
        if (!allowed) {
          notifySettings('refused', ctx, before.item.id);
          throw conflict(
            'Only the person who created this event can change its notifications',
            EVENT_NOTIFY_LOCKED_PROBLEM,
          );
        }
      }
      if (checkPeople) {
        const live = new Set(deckMembers.map((m) => m.userId));
        if (payload.notify.audience.userIds.some((id) => !live.has(id))) {
          refuseWrite('audience_unknown_member', ctx, itemId);
          throw new HttpError(
            422,
            EVENT_AUDIENCE_UNKNOWN_MEMBER_PROBLEM,
            'Unprocessable Content',
            'Only members of this deck can be notified',
            [{ path: 'payload.notify.audience.userIds', message: 'Not a member of this deck' }],
          );
        }
      }
      return { payload, notifyChanged };
    },

    /** D363: logs an accepted notify change once the write committed. */
    notifyChanged(ctx: EventWriteContext, itemId: string): void {
      notifySettings('changed', ctx, itemId);
    },

    /** D12: a PATCH naming another type is refused (logged when an event is involved). */
    refuseTypeChange(ctx: EventWriteContext, item: ItemRow, type: string): never {
      if (item.type === 'event' || type === 'event') refuseWrite('type_change', ctx, item.id);
      throw conflict("A card's type can't be changed", TYPE_CHANGE_PROBLEM);
    },

    /** D359: see `createEventNoticeHook`. */
    noticeHook: createEventNoticeHook({ allDayNoticeHour: limits.allDayNoticeHour, now }),

    /**
     * D364: mutes or unmutes `item` for the actor (idempotent). The caller has loaded it with read
     * access. Muting needs the actor in the audience; unmuting always succeeds for a reader.
     */
    async mute(actor: Actor, item: ItemRow, muted: boolean): Promise<void> {
      const record = (
        outcome: EventCardDecisions['event.mute']['outcome'],
        reason?: EventCardDecisions['event.mute']['reason'],
      ) =>
        decisions.record('event.mute', {
          outcome,
          ...(reason ? { reason } : {}),
          requestId: requestIdOf(actor),
          userId: actor.user.id,
          deckId: item.deckId,
          itemId: item.id,
        });
      if (item.type !== 'event') {
        record('refused', 'not_an_event');
        throw conflict('Only events can be muted', NOT_AN_EVENT_PROBLEM);
      }
      if (muted) {
        const [ctx, visibilities] = await Promise.all([
          members.deckContext(item.deckId),
          members.categoryVisibilities([item.id]),
        ]);
        if (!audienceFor(item, ctx, visibilities.get(item.id) ?? []).includes(actor.user.id)) {
          record('refused', 'not_in_audience');
          throw conflict('This event does not notify you', EVENT_NOT_IN_AUDIENCE_PROBLEM);
        }
      }
      await events.setMute(item.id, actor.user.id, muted);
      record(muted ? 'muted' : 'unmuted');
    },

    /** 042: the `event` DTO field for each event row, as `user` sees it. */
    async states(
      user: CurrentUser,
      rows: ItemRow[],
      role: MemberRole,
    ): Promise<Map<string, EventState>> {
      const result = new Map<string, EventState>();
      const eventRows = rows.filter((r) => r.type === 'event');
      if (eventRows.length === 0) return result;

      const ids = eventRows.map((r) => r.id);
      const [spans, notices, muted, visibilities] = await Promise.all([
        events.spans(ids),
        events.currentNotices(ids),
        events.mutedBy(user.id, ids),
        members.categoryVisibilities(ids),
      ]);
      const contexts = new Map<string, DeckContext>();
      for (const deckId of new Set(eventRows.map((r) => r.deckId))) {
        contexts.set(deckId, await members.deckContext(deckId));
      }

      for (const row of eventRows) {
        const span = spans.get(row.id);
        const ctx = contexts.get(row.deckId);
        if (!span || !ctx) continue;
        const audience = audienceFor(row, ctx, visibilities.get(row.id) ?? []);
        result.set(row.id, {
          startsAt: span.startsAt.toISOString(),
          endsAt: span.endsAt.toISOString(),
          allDay: span.allDay,
          timeZone: span.timeZone,
          notices: (notices.get(row.id) ?? []).map((n) => ({
            amount: n.amount,
            unit: n.unit,
            fireAt: n.fireAt.toISOString(),
            state: n.state,
          })),
          muted: muted.has(row.id),
          inAudience: audience.includes(user.id),
          canEditNotify:
            can(role, 'item.update') &&
            canEditEventNotify({
              userId: user.id,
              role,
              createdBy: row.createdBy,
              creatorIsMember: ctx.members.some((m) => m.userId === row.createdBy),
              status: row.status,
            }),
        });
      }
      return result;
    },
  };
}

export type EventCardsService = ReturnType<typeof createEventCardsService>;
