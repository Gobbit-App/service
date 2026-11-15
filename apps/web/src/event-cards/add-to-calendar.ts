import type { Item } from '@gobbit/shared';
import { nextOccurrence } from '@gobbit/shared/event-constants';
import { asEventPayload } from '../cards/payload-guards';
import { shareUrl } from '../lib/share';

export const ADD_TO_CALENDAR_LABEL = 'Add to calendar';
export const ADD_TO_CALENDAR_FAILED = "Couldn't make the calendar file";

/** 042 (US6): offered on every live event card, for every role. */
export function canAddToCalendar(item: Item): boolean {
  return item.type === 'event' && item.deletedAt === undefined;
}

/** The `.ics` text for an event card; `null` when its payload isn't a readable event. */
export async function eventIcs(item: Item, origin: string, now: Date): Promise<string | null> {
  const payload = asEventPayload(item.payload);
  if (!payload) return null;
  // D402: the file starts at the current or next occurrence; RRULE repeats it yearly.
  const current = nextOccurrence(payload, now);
  // D368: the writer is a lazy chunk (precached, so this works offline).
  const { toIcs } = await import('@gobbit/shared/ics');
  return toIcs(
    {
      id: item.id,
      title: item.title,
      allDay: current.allDay,
      start: current.start,
      end: current.end,
      timeZone: current.timeZone,
      repeat: current.repeat,
      location: current.location,
      url: payload.link?.url,
    },
    { cardUrl: shareUrl(origin, item.id), now },
  );
}

/** Builds the file in the browser and saves it as `<title>.ics`. Throws when it can't. */
export async function downloadEventIcs(item: Item, origin = window.location.origin): Promise<void> {
  const ics = await eventIcs(item, origin, new Date());
  if (ics === null) throw new Error('Not a readable event');
  const { icsFileName } = await import('@gobbit/shared/ics');

  const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = icsFileName(item.title);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Let the click start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
