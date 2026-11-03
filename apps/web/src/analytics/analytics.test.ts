import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, Me } from '@gobbit/shared';
import type { AnalyticsConsentValue } from '@gobbit/shared/analytics';
import { queryKeys } from '../api/query-keys';
import { testQueryClient } from '../test/render';
import { deckIdFromCache, startAnalytics, trackContent, type Place } from './analytics';
import type { InstallOptions } from './tracker';

const MEMBER = '0b8f2f4e-3c1a-4d2b-9e6f-1a2b3c4d5e6f';
const OTHER = '1c9f3f5e-4d2b-4e3c-8f7a-2b3c4d5e6f70';
const DECK = '11111111-2222-4333-8444-555555555555';
const ANALYTICS = { siteId: 'site-1', host: 'gobbit.example' };

const appConfig = (analytics: AppConfig['analytics']): AppConfig => ({
  analytics,
  cloudinaryCloudName: null,
  commit: 'test',
  search: { semantic: false, ask: false },
  ingest: { enabled: false, emailDomain: null, shortcutUrl: null },
});

const me = (id: string, value: AnalyticsConsentValue = 'unanswered'): Me => ({
  user: { id, email: 'a@b.c', displayName: 'A' },
  decks: [],
  isPlatformAdmin: false,
  analyticsConsent:
    value === 'unanswered'
      ? { value, at: null, source: null }
      : { value, at: '2026-11-01T10:00:00.000Z', source: 'prompt' },
});

type SetupOptions = {
  analytics?: AppConfig['analytics'];
  member?: string | null;
  consent?: AnalyticsConsentValue;
  device?: AnalyticsConsentValue;
  place?: Place;
};

function setup({
  analytics = ANALYTICS,
  member = MEMBER,
  consent = 'unanswered',
  device = 'unanswered',
  place = { routeId: '/d/$slug/', pathname: '/d/smith-family' },
}: SetupOptions = {}) {
  const queryClient = testQueryClient();
  queryClient.setQueryData(queryKeys.config, appConfig(analytics));
  if (member) queryClient.setQueryData(queryKeys.me, me(member, consent));
  const deviceState = { value: device };
  const umami = { track: vi.fn(), identify: vi.fn() };
  let options: InstallOptions | undefined;
  const installTracker = vi.fn(async (o: InstallOptions) => {
    options = o;
    return umami;
  });
  const load = vi.fn(async () => ({ installTracker }));
  let navigate: () => void = () => {};
  const state = { place };
  const started = startAnalytics({
    queryClient,
    load,
    whenIdle: (run) => run(),
    isOnline: () => true,
    deviceConsent: () => deviceState.value,
    origin: 'https://gobbit.example',
    current: () => state.place,
    onNavigate: (cb) => {
      navigate = cb;
      return () => {};
    },
  });
  const go = (next: Place) => {
    state.place = next;
    navigate();
  };
  return {
    queryClient,
    umami,
    load,
    started,
    go,
    deviceState,
    context: () => options!.getContext(),
  };
}

/** Lets the chained load → install → page view promises settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});

describe('startAnalytics (D252–D255)', () => {
  it('does nothing when analytics is off (FR-010)', async () => {
    const { load, started } = setup({ analytics: null });
    stop = await started;
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the tracker, identifies the member and sends the first view', async () => {
    const { umami, started, context } = setup();
    stop = await started;
    await settle();
    expect(umami.identify).toHaveBeenCalledWith(MEMBER);
    expect(umami.track).toHaveBeenCalledTimes(1);
    expect(umami.track).toHaveBeenCalledWith();
    expect(context()).toEqual({
      screen: { pattern: '/d/:deck', name: 'Deck' },
      memberId: MEMBER,
      online: true,
      origin: 'https://gobbit.example',
      consented: true,
    });
  });

  it('waits for a member before loading (sign-in is not tracked)', async () => {
    const { queryClient, load, umami, started } = setup({
      member: null,
      place: { routeId: '/sign-in', pathname: '/sign-in' },
    });
    stop = await started;
    await settle();
    expect(load).not.toHaveBeenCalled();

    queryClient.setQueryData(queryKeys.me, me(MEMBER));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(umami.track).not.toHaveBeenCalled(); // still on sign-in
  });

  it('sends one view per tracked path, none for untracked screens', async () => {
    const { umami, started, go } = setup();
    stop = await started;
    await settle();
    go({ routeId: '/d/$slug/', pathname: '/d/smith-family' }); // same path: no repeat
    go({ routeId: '/i/$itemId', pathname: `/i/${DECK}` });
    go({ routeId: '/auth/error', pathname: '/auth/error' });
    expect(umami.track).toHaveBeenCalledTimes(2);
  });

  it('starts a new identity when the member changes', async () => {
    const { queryClient, umami, started } = setup();
    stop = await started;
    await settle();
    queryClient.setQueryData(queryKeys.me, me(OTHER));
    expect(umami.identify).toHaveBeenLastCalledWith(OTHER);
    expect(umami.track).toHaveBeenCalledTimes(2);
  });

  it('stays off when the tracker cannot load', async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.config, appConfig(ANALYTICS));
    queryClient.setQueryData(queryKeys.me, me(MEMBER));
    stop = await startAnalytics({
      queryClient,
      load: () => Promise.reject(new Error('blocked')),
      whenIdle: (run) => run(),
      current: () => ({ routeId: '/', pathname: '/' }),
      onNavigate: () => () => {},
    });
    await settle();
    expect(() => trackContent('card-created', { channel: 'editor' })).not.toThrow();
  });
});

describe('consent gating (D261, D262)', () => {
  it('loads nothing for a member who declined', async () => {
    const { load, started } = setup({ consent: 'declined' });
    stop = await started;
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(() => trackContent('card-created', { channel: 'editor' })).not.toThrow();
  });

  it('a device "No thanks" keeps an unanswered member silent (FR-010)', async () => {
    const { load, started } = setup({ device: 'declined' });
    stop = await started;
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it('the member’s own "allowed" wins over a device decline', async () => {
    const { umami, started } = setup({ consent: 'allowed', device: 'declined' });
    stop = await started;
    await settle();
    expect(umami.track).toHaveBeenCalledTimes(1);
  });

  it('turning to allowed loads the tracker and sends the current view without a reload', async () => {
    const { queryClient, umami, load, started } = setup({ consent: 'declined' });
    stop = await started;
    await settle();
    queryClient.setQueryData(queryKeys.me, me(MEMBER, 'allowed'));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(umami.track).toHaveBeenCalledTimes(1);
  });

  it('turning to declined stops views, events and the hook at once', async () => {
    const { queryClient, umami, started, go, context } = setup();
    stop = await started;
    await settle();
    queryClient.setQueryData(queryKeys.me, me(MEMBER, 'declined'));
    go({ routeId: '/i/$itemId', pathname: `/i/${DECK}` });
    trackContent('card-created', { channel: 'editor' });
    expect(umami.track).toHaveBeenCalledTimes(1); // only the first view
    expect(context().consented).toBe(false);
  });

  it('a device decline after load cancels in the hook', async () => {
    const { started, context, deviceState } = setup();
    stop = await started;
    await settle();
    deviceState.value = 'declined';
    expect(context().consented).toBe(false);
  });
});

describe('trackContent (D256)', () => {
  it('is a no-op before analytics starts', () => {
    expect(() => trackContent('card-created', { channel: 'editor' })).not.toThrow();
  });

  it('sends the event with its allow-listed props once loaded', async () => {
    const { umami, started } = setup();
    stop = await started;
    await settle();
    trackContent('card-deleted', { deckId: DECK, channel: 'card-menu', type: 'text' });
    expect(umami.track).toHaveBeenLastCalledWith('card-deleted', {
      deckId: DECK,
      channel: 'card-menu',
      type: 'text',
    });
  });

  it('never throws into the caller', async () => {
    const { umami, started } = setup();
    stop = await started;
    await settle();
    umami.track.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => trackContent('card-shared', { channel: 'copy-link' })).not.toThrow();
  });

  it('sends nothing while offline (FR-009)', async () => {
    const { umami, started } = setup();
    stop = await started;
    await settle();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    trackContent('card-edited', { channel: 'editor' });
    online.mockRestore();
    expect(umami.track).toHaveBeenCalledTimes(1); // only the page view
  });
});

describe('deckIdFromCache', () => {
  it('reads the cached deck by slug', () => {
    const queryClient = testQueryClient();
    expect(deckIdFromCache(queryClient, 'smith')).toBeUndefined();
    queryClient.setQueryData(queryKeys.deck('smith'), { id: DECK });
    expect(deckIdFromCache(queryClient, 'smith')).toBe(DECK);
  });
});
