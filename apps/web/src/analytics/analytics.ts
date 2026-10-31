import type { QueryClient } from '@tanstack/react-query';
import type { AppConfig, Deck, Me } from '@gobbit/shared';
import type {
  ContentEventName,
  ContentEventProps,
  SanitizeContext,
  Screen,
} from '@gobbit/shared/analytics';
import { configQuery } from '../api/queries';
import { queryKeys } from '../api/query-keys';
import { screenFor } from './catalogue';
import type { InstallOptions } from './tracker';
import type { Umami } from './types';

/** Where the app is: the deepest matched route id and the real path (never sent, D244). */
export type Place = { routeId: string | undefined; pathname: string };

export type AnalyticsDeps = {
  queryClient: QueryClient;
  /** Calls back after every resolved navigation; returns an unsubscribe. */
  onNavigate: (callback: () => void) => () => void;
  current: () => Place;
  /** The tracker chunk, loaded on demand (D246); tests pass a fake. */
  load?: () => Promise<{ installTracker: (options: InstallOptions) => Promise<Umami | null> }>;
  /** Runs after the app is interactive (FR-011). */
  whenIdle?: (run: () => void) => void;
  isOnline?: () => boolean;
  origin?: string;
};

type Session = {
  umami: Umami | null;
  screen: Screen | null;
  memberId: string | undefined;
  identified: string | undefined;
  lastPath: string | undefined;
};

/** The running session; null until started with analytics on, so `trackContent` is a no-op. */
let session: Session | null = null;

const defaultIdle = (run: () => void) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
};

function memberIdOf(queryClient: QueryClient): string | undefined {
  return queryClient.getQueryData<Me>(queryKeys.me)?.user.id;
}

async function analyticsConfig(queryClient: QueryClient): Promise<AppConfig['analytics']> {
  try {
    return (await queryClient.fetchQuery(configQuery())).analytics;
  } catch {
    return null; // offline or API down: no analytics this session
  }
}

/** D247: a new identified session whenever the member changes (sign-in as someone else). */
function syncIdentity(s: Session): void {
  if (!s.umami || !s.memberId || s.memberId === s.identified) return;
  s.identified = s.memberId;
  s.umami.identify(s.memberId);
}

/**
 * D244–D247: one page view per tracked screen change, sent only after the tracker loaded (on idle,
 * once a member is known). The real path only de-duplicates; the hook sends the pattern.
 */
export async function startAnalytics(deps: AnalyticsDeps): Promise<() => void> {
  const {
    queryClient,
    onNavigate,
    current,
    load = () => import('./tracker'),
    whenIdle = defaultIdle,
    isOnline = () => navigator.onLine,
    origin = window.location.origin,
  } = deps;

  const config = await analyticsConfig(queryClient);
  if (!config) return () => {};

  const s: Session = {
    umami: null,
    screen: null,
    memberId: memberIdOf(queryClient),
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
  });

  function pageView(): void {
    const place = current();
    s.screen = screenFor(place.routeId);
    if (!s.umami || !s.screen || !s.memberId || place.pathname === s.lastPath) return;
    s.lastPath = place.pathname;
    try {
      syncIdentity(s);
      s.umami.track();
    } catch {
      // FR-009: analytics never breaks navigation.
    }
  }

  function loadWhenReady(): void {
    if (loading || !s.memberId) return;
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
    const memberId = memberIdOf(queryClient);
    if (memberId === s.memberId) return;
    s.memberId = memberId;
    s.lastPath = undefined; // a new member's first screen is a new view
    loadWhenReady();
    pageView();
  });
  const unsubscribeRouter = onNavigate(pageView);

  pageView(); // sets the current screen
  loadWhenReady();

  return () => {
    unsubscribeCache();
    unsubscribeRouter();
    if (session === s) session = null;
  };
}

/**
 * D248: one of the four content events, after the server accepted the action. A no-op while
 * analytics is off, not loaded yet or offline; never throws into the caller (FR-009).
 */
export function trackContent(name: ContentEventName, props: ContentEventProps): void {
  const s = session;
  if (!s?.umami || !navigator.onLine) return;
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
