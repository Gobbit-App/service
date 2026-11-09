import {
  codePointLength,
  type EventDateSource,
  type EventExtractFallbackReason,
  type EventZoneSource,
  type LinkPreview,
  type StructuredEvent,
} from '@gobbit/shared';
import { EVENT_NOTIFY_DEFAULT, eventSpan, parseEventSpan } from '@gobbit/shared/event-constants';
import { isTimeZone } from '@gobbit/shared/reminders';
import type { ProposeCardInput } from './extract-prompt';

const DAY_MS = 86_400_000;

/** D370/D374: what the validator knows about events for this share. */
export interface EventContext {
  /** The page's one schema.org Event. */
  structured?: StructuredEvent;
  /** The page describes several distinct events (D370: never pick one). */
  severalEvents: boolean;
  /** D374: the zone that reads times without an offset, and where it came from. */
  timeZone: string;
  zoneSource: EventZoneSource;
  /** Personal decks always notify `me` (D362). */
  personalDeck: boolean;
  /** D371: env limits, as the editor's writes get them. */
  startMaxDays: number;
  locationMax: number;
  now: Date;
}

/** D378: what the extraction decided about an event; logged as `ingest.event_extract`. */
export type EventDecision =
  | { outcome: 'event_proposed'; dateSource: EventDateSource; zoneSource: EventZoneSource }
  | { outcome: 'event_fallback'; reason: EventExtractFallbackReason };

export type ProposedEvent =
  | {
      ok: true;
      payload: Record<string, unknown>;
      decision: EventDecision & { outcome: 'event_proposed' };
    }
  | { ok: false; decision: EventDecision & { outcome: 'event_fallback' } };

const fallback = (reason: EventExtractFallbackReason): ProposedEvent => ({
  ok: false,
  decision: { outcome: 'event_fallback', reason },
});

/** D370: the model's start for an all-day event is its date even if it added a time. */
function modelTime(value: string | null | undefined, allDay: boolean | null | undefined) {
  const v = value?.trim();
  if (!v) return null;
  return allDay === true ? v.slice(0, 10) : v;
}

function clipLocation(value: string | null | undefined, max: number): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return codePointLength(clean) <= max ? clean : Array.from(clean).slice(0, max).join('').trim();
}

/**
 * D370: the event payload for a share recognised as an event. Structured data wins over the model
 * for the dates and the location (structured data first, never an invented value); a failure means
 * the share becomes a link or text card, with no correction round trip.
 */
export function proposeEvent(
  input: ProposeCardInput,
  ctx: EventContext,
  link: { url?: string; preview?: LinkPreview },
): ProposedEvent {
  if (ctx.severalEvents && !ctx.structured) return fallback('several_events');
  if (!isTimeZone(ctx.timeZone)) return fallback('invalid_zone');

  const s = ctx.structured;
  const dateSource: EventDateSource = s ? 'structured' : 'model';
  const parsed = s
    ? parseEventSpan(s.startDate, s.endDate, ctx.timeZone)
    : parseEventSpan(
        modelTime(input.event?.start, input.event?.allDay),
        modelTime(input.event?.end, input.event?.allDay),
        ctx.timeZone,
      );
  if (!parsed.ok) return fallback(parsed.reason);

  const span = { ...parsed.span, timeZone: ctx.timeZone };
  if (eventSpan(span).startsAt.getTime() > ctx.now.getTime() + ctx.startMaxDays * DAY_MS) {
    return fallback('start_out_of_range');
  }

  const location = clipLocation(s?.location ?? input.event?.location, ctx.locationMax);
  const url = s?.url ?? link.url;
  const payload: Record<string, unknown> = {
    ...span,
    ...(location ? { location } : {}),
    ...(url ? { url } : {}),
    ...(url && link.preview && url === link.url ? { preview: link.preview } : {}),
    notify: {
      before: EVENT_NOTIFY_DEFAULT.before.map((b) => ({ ...b })),
      audience: { mode: ctx.personalDeck ? 'me' : EVENT_NOTIFY_DEFAULT.audience.mode, userIds: [] },
    },
  };
  return {
    ok: true,
    payload,
    decision: { outcome: 'event_proposed', dateSource, zoneSource: ctx.zoneSource },
  };
}
