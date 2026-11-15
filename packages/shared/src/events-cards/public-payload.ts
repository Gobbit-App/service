import type { StoredLinkPreview as LinkPreview } from '../schemas/link-preview';
import type { EventRepeat } from './constants';

/** Fields of an event payload strangers may see (D365). */
export interface EventPublicPayload {
  allDay: boolean;
  start: string;
  end?: string;
  timeZone: string;
  /** D402 */
  repeat?: EventRepeat;
  location?: string;
  url?: string;
  preview?: Omit<LinkPreview, 'imageLookup' | 'imageRemoved'>;
}

interface StoredEventPayload extends EventPublicPayload {
  preview?: LinkPreview;
}

/**
 * D365: the public allow-list of an event payload, built field by field: `notify` (who is notified,
 * when) and the snapshot bookkeeping markers never reach strangers, share previews or search.
 */
export function eventPublicPayload(payload: StoredEventPayload): EventPublicPayload {
  const out: EventPublicPayload = {
    allDay: payload.allDay,
    start: payload.start,
    timeZone: payload.timeZone,
  };
  if (payload.end !== undefined) out.end = payload.end;
  if (payload.repeat !== undefined) out.repeat = payload.repeat;
  if (payload.location !== undefined) out.location = payload.location;
  if (payload.url !== undefined) out.url = payload.url;
  if (payload.preview) {
    const { imageLookup: _lookup, imageRemoved: _removed, ...preview } = payload.preview;
    out.preview = preview;
  }
  return out;
}
