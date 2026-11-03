import type { QueryClient } from '@tanstack/react-query';
import type { AppConfig, Deck, Me } from '@gobbit/shared';
import {
  analyticsAllowed,
  type AnalyticsConsentValue,
  type ContentEventName,
  type ContentEventProps,
  type SanitizeContext,
  type Screen,
} from '@gobbit/shared/analytics';
import { configQuery, meQuery } from '../api/queries';
import { queryKeys } from '../api/query-keys';
import { isPublicPath } from '../api/session';
import { screenFor } from './catalogue';
import { readDeviceConsent } from './device-consent';
import type { InstallOptions } from './tracker';
import type { Umami } from './types';

/** Where the app is: the deepest matched route id and the real path (never sent, D252). */
export type Place = { routeId: string | undefined; pathname: string };

export type AnalyticsDeps = {
  queryClient: QueryClient;
  /** Calls back after every resolved navigation; returns an unsubscribe. */
  onNavigate: (callback: () => void) => () => void;
  current: () => Place;
  /** The tracker chunk, loaded on demand (D254); tests pass a fake. */
  load?: () => Promise<{ installTracker: (options: InstallOptions) => Promise<Umami | null> }>;
  /** Runs after the app is interactive (FR-011). */
  whenIdle?: (run: () => void) => void;
  isOnline?: () => boolean;
  /** This browser's visitor choice (D264); read at every send, tests pass a fake. */
  deviceConsent?: () => AnalyticsConsentValue;
  origin?: string;
  /** Asks for `me` when no screen did (a direct load of e.g. `/new`); tests pass a fake. */
  fetchMe?: () => Promise<void>;
};

type Session = {
  umami: Umami | null;
  screen: Screen | null;
  memberId: string | undefined;
  /** The member's own answer from the `me` cache (D262). */
  consent: AnalyticsConsentValue | undefined;
  /** D261/D281: a member is known and has allowed it, checked at every send. */
  allowed: () => boolean;
  identified: string | undefined;
  lastPath: string | undefined;
};

/** The running session; null until started with analytics on, so `trackContent` is a no-op. */
let session: Session | null = null;

const defaultIdle = (run: () => void) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
};

function memberOf(queryClient: QueryClient): {
  memberId: string | undefined;
  consent: AnalyticsConsentValue | undefined;
} {
  const me = queryClient.getQueryData<Me>(queryKeys.me);
  return { memberId: me?.user.id, consent: me?.analyticsConsent?.value };
}

async function analyticsConfig(queryClient: QueryClient): Promise<AppConfig['analytics']> {
  try {
    return (await queryClient.fetchQuery(configQuery())).analytics;
  } catch {
    return null; // offline or API down: no analytics this session
  }
}

/** D255: a new identified session whenever the member changes (sign-in as someone else). */
function syncIdentity(s: Session): void {
  if (!s.umami || !s.memberId || s.memberId === s.identified) return;
  s.identified = s.memberId;
  s.umami.identify(s.memberId);
}

/**
 * D252–D255: one page view per tracked screen change, sent only after the tracker loaded (on idle,
 * once a member is known). The real path only de-duplicates; the hook sends the pattern.
 * D261/D262 (opt-in, D281): nothing loads or sends until the member allowed it
 * (`analyticsAllowed`); the hook also cancels (`consented: false`) if the answer turns to no
 * after the tracker loaded.
 */
export async function startAnalytics(deps: AnalyticsDeps): Promise<() => void> {
  const {
    queryClient,
    onNavigate,
    current,
    load = () => import('./tracker'),
    whenIdle = defaultIdle,
    isOnline = () => navigator.onLine,
    deviceConsent = readDeviceConsent,
    origin = window.location.origin,
    fetchMe = () => queryClient.prefetchQuery(meQuery()),
  } = deps;

  const config = await analyticsConfig(queryClient);
  if (!config) return () => {};

  const s: Session = {
    umami: null,
    screen: null,
    ...memberOf(queryClient),
    allowed: () =>
      Boolean(s.memberId && s.consent) && analyticsAllowed(s.consent!, deviceConsent()),
    identified: undefined,
    lastPath: undefined,
  };
  session = s;
  let loading = false;

  const getContext = (): SanitizeContext => ({
    screen: s.screen,
    memberId: s.memberId,
    online: isOnline(),
    origin,
    consented: s.allowed(),
  });

  function pageView(): void {
    const place = current();
    s.screen = screenFor(place.routeId);
    if (!s.umami || !s.screen || !s.allowed() || place.pathname === s.lastPath) return;
    s.lastPath = place.pathname;
    try {
      syncIdentity(s);
      s.umami.track();
    } catch {
      // FR-009: analytics never breaks navigation.
    }
  }

  function loadWhenReady(): void {
    if (loading || !s.allowed()) return; // D262: never loaded while the answer is no
    loading = true;
    whenIdle(() => {
      load()
        .then(({ installTracker }) => installTracker({ ...config!, getContext }))
        .then((umami) => {
          s.umami = umami;
          pageView();
        })
        .catch(() => {
          s.umami = null; // chunk or tracker unavailable: stay off silently
        });
    });
  }

  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey;
    if (key.length !== 1 || key[0] !== queryKeys.me[0]) return;
    const next = memberOf(queryClient);
    if (next.memberId === s.memberId && next.consent === s.consent) return;
    const wasAllowed = s.allowed();
    const memberChanged = next.memberId !== s.memberId;
    Object.assign(s, next);
    // A new member's first screen, or the screen showing when the answer turned to yes, is a
    // new view (D262: no reload needed).
    if (memberChanged || (!wasAllowed && s.allowed())) s.lastPath = undefined;
    loadWhenReady();
    pageView();
  });
  const unsubscribeRouter = onNavigate(pageView);

  pageView(); // sets the current screen
  loadWhenReady();
  // D281: the answer lives on the account, so a screen that doesn't read `me` (the editor)
  // would otherwise never load the tracker. Public pages (sign-in) have no member to ask about.
  if (!s.memberId && !isPublicPath(current().pathname)) void fetchMe().catch(() => {});

  return () => {
    unsubscribeCache();
    unsubscribeRouter();
    if (session === s) session = null;
  };
}

/**
 * D256: one of the four content events, after the server accepted the action. A no-op while
 * analytics is off, not loaded yet or offline; never throws into the caller (FR-009).
 */
export function trackContent(name: ContentEventName, props: ContentEventProps): void {
  const s = session;
  if (!s?.umami || !navigator.onLine || !s.allowed()) return;
  try {
    syncIdentity(s);
    s.umami.track(name, { ...props });
  } catch {
    // ignored: analytics must not change the member's action
  }
}

/** A deck's id from the cache (hooks that only know the slug); undefined when not cached. */
export function deckIdFromCache(queryClient: QueryClient, slug: string): string | undefined {
  return queryClient.getQueryData<Deck>(queryKeys.deck(slug))?.id;
}
