import {
  BEFORE_SEND_HOOK,
  sanitizePayload,
  type SanitizeContext,
  type TrackerPayload,
} from '@gobbit/shared/analytics';
import type { Umami } from './types';

/** Same-origin prefix Caddy proxies to Umami (D232). */
const STATS_BASE_PATH = '/stats';

type BeforeSend = (type: string, payload: TrackerPayload) => TrackerPayload | null;
type TrackerWindow = Window & { umami?: Umami } & Partial<
    Record<typeof BEFORE_SEND_HOOK, BeforeSend>
  >;

export type InstallOptions = {
  siteId: string;
  host: string;
  /** Read at send time: the screen showing now, the member, online state (D246, D247). */
  getContext: () => SanitizeContext;
  doc?: Document;
  win?: TrackerWindow;
};

/**
 * D246 (contract §2): defines the before-send hook, then appends Umami's tracker with manual page
 * views, no query or hash, Do Not Track honoured and only this host. Resolves to the tracker, or
 * null when it can't load (blocked, offline, Umami down) — analytics then stays off silently.
 */
export function installTracker({
  siteId,
  host,
  getContext,
  doc = document,
  win = window as TrackerWindow,
}: InstallOptions): Promise<Umami | null> {
  win[BEFORE_SEND_HOOK] = (type, payload) => {
    try {
      return sanitizePayload(type, payload, getContext());
    } catch {
      return null; // never send what we failed to clean
    }
  };

  const script = doc.createElement('script');
  script.defer = true;
  script.src = `${STATS_BASE_PATH}/script.js`;
  Object.assign(script.dataset, {
    websiteId: siteId,
    hostUrl: STATS_BASE_PATH,
    domains: host,
    doNotTrack: 'true',
    autoTrack: 'false',
    excludeSearch: 'true',
    excludeHash: 'true',
    beforeSend: BEFORE_SEND_HOOK,
  });

  return new Promise((resolve) => {
    script.addEventListener('load', () => resolve(win.umami ?? null));
    script.addEventListener('error', () => resolve(null));
    doc.head.append(script);
  });
}
