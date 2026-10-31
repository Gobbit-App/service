import { cleanEventData, isContentEventName, isUuidLike } from './events';
import type { Screen } from './screens';

/** What the before-send hook knows at send time (D246, D247). */
export type SanitizeContext = {
  /** The screen showing now; null = untracked (sign-in, auth error). */
  screen: Screen | null;
  /** The signed-in member's Gobbit user id; absent on anonymous pages. */
  memberId?: string | null;
  /** `navigator.onLine`; offline cancels every request (FR-009). */
  online: boolean;
  /** The page's own origin; a same-origin referrer is sent as empty. */
  origin: string;
};

/** The fields of Umami's tracker payload this hook reads or writes. */
export type TrackerPayload = {
  website?: string;
  hostname?: string;
  screen?: string;
  language?: string;
  url?: string;
  title?: string;
  referrer?: string;
  tag?: string;
  id?: string;
  name?: string;
  data?: unknown;
};

/** D246: an external referrer's origin, else empty (same origin, invalid, missing). */
export function referrerOrigin(referrer: string | undefined, origin: string): string {
  if (!referrer) return '';
  try {
    const ref = new URL(referrer);
    if (ref.protocol !== 'http:' && ref.protocol !== 'https:') return '';
    return ref.origin === origin ? '' : ref.origin;
  } catch {
    return '';
  }
}

/** Fields the tracker builds that carry nothing about the page or the member. */
const KEPT = ['website', 'hostname', 'screen', 'language'] as const;

/**
 * D246: the one choke point every analytics request passes (page view, event, identify).
 * Rewrites the address to the route pattern and the title to the screen name, reduces the
 * referrer to its origin, sets the member id (D247), keeps only allow-listed event data and
 * returns null (cancel) when offline, untracked, or not one of the four content events.
 */
export function sanitizePayload(
  type: string,
  payload: TrackerPayload | null | undefined,
  ctx: SanitizeContext,
): TrackerPayload | null {
  if (!payload || !ctx.online || !ctx.screen) return null;
  const memberId = isUuidLike(ctx.memberId) ? ctx.memberId : undefined;

  const clean: TrackerPayload = {};
  for (const key of KEPT) {
    if (typeof payload[key] === 'string') clean[key] = payload[key];
  }
  clean.url = ctx.screen.pattern;
  clean.title = ctx.screen.name;
  clean.referrer = referrerOrigin(payload.referrer, ctx.origin);
  if (memberId) clean.id = memberId;

  if (type === 'identify') return memberId ? clean : null;
  if (type !== 'event') return null;
  if (payload.name === undefined) return clean; // page view
  if (!isContentEventName(payload.name)) return null;
  const data = cleanEventData(payload.data);
  if (!data) return null;
  return { ...clean, name: payload.name, data };
}
