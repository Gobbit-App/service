import { eventSpan, nextOccurrence, type EventTimes } from '@gobbit/shared/event-constants';
import { formatEventAbsolute } from '@gobbit/shared/event-time';

/**
 * D367: "Thu 3 Dec, 18:00–20:00 (Asia/Jerusalem)" / "Thu 3 – Sat 5 Dec": the event in its own
 * zone with no relative status (public pages, share previews). Null when the payload can't be read.
 * D402: a yearly event shows its current or next occurrence, suffixed " · every year".
 */
export function eventWhenLine(payload: EventTimes, now?: Date): string | null {
  try {
    const current = nextOccurrence(payload, now ?? new Date());
    const { startsAt, endsAt } = eventSpan(current);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
    const line = formatEventAbsolute(
      { startsAt, endsAt, allDay: current.allDay, timeZone: current.timeZone },
      { hasEnd: current.end !== undefined, ...(now ? { now } : {}) },
    );
    return current.repeat === 'yearly' ? `${line} · every year` : line;
  } catch {
    return null;
  }
}

/**
 * 042 share/OG description: "date · location" for an event card, null for other types. The
 * audience and notify settings are never part of it (D365).
 */
export function eventSummary(item: { type: string; payload: unknown }, now?: Date): string | null {
  if (item.type !== 'event') return null;
  const payload = item.payload as EventTimes & { location?: string };
  const when = eventWhenLine(payload, now);
  if (!when) return null;
  const location = payload.location?.trim();
  return location ? `${when} · ${location}` : when;
}
