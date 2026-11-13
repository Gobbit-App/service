import type { EventZoneSource, IngestRaw } from '@gobbit/shared';
import { isTimeZone } from '@gobbit/shared/reminders';
import type { EventDecision } from '../ai/extract-event';
import type { Logger } from '../lib/logger';

/** D378: the decision event for a share that was tried as an event. */
export const EVENT_EXTRACT_EVENT = 'ingest.event_extract';

/**
 * D374: the zone that reads a shared event's times: the request's own zone when it is a real IANA
 * zone, else the deck-wide fallback (`INGEST_DEFAULT_TIME_ZONE`).
 */
export function resolveEventZone(
  raw: Pick<IngestRaw, 'timeZone'>,
  fallbackZone: string,
): { timeZone: string; zoneSource: EventZoneSource } {
  const requested = raw.timeZone?.trim();
  return requested && isTimeZone(requested)
    ? { timeZone: requested, zoneSource: 'request' }
    : { timeZone: fallbackZone, zoneSource: 'fallback' };
}

/** D378: logs what the extraction decided about an event; ids and closed sets only. */
export function logEventExtract(
  log: Pick<Logger, 'info'>,
  ids: { jobId: string; deckId: string; userId: string; itemId: string },
  decision: EventDecision,
): void {
  log.info(
    { event: EVENT_EXTRACT_EVENT, ...decision, ...ids },
    decision.outcome === 'event_proposed'
      ? 'share proposed as an event'
      : 'share not proposed as an event',
  );
}
