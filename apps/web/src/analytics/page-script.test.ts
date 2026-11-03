import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_CONSENT_KEY } from '@gobbit/shared/analytics';
import source from '../../public/analytics/page.js?raw';

type Hook = (type: string, payload: unknown) => Record<string, unknown> | null;
type HookWindow = Window & { __gobbitAnalyticsBeforeSend?: Hook };
const win = window as HookWindow;

const SITE = { websiteId: 'site-1', domains: 'gobbit.example' };

/** Runs page.js as the browser would, with its own `<script data-…>` as `currentScript`. */
function load(dataset: Record<string, string>): Hook {
  const script = document.createElement('script');
  Object.assign(script.dataset, dataset);
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  new Function(source)();
  return win.__gobbitAnalyticsBeforeSend!;
}

const tracker = () =>
  document.head.querySelector<HTMLScriptElement>('script[src="/stats/script.js"]');
const banner = () => document.querySelector<HTMLElement>('[data-consent-banner]')!;
const opener = () => document.querySelector<HTMLButtonElement>('[data-consent-open]')!;
const current = () => document.querySelector<HTMLElement>('[data-consent-current]')!;
const store = (value: string) =>
  localStorage.setItem(
    DEVICE_CONSENT_KEY,
    JSON.stringify({ value, at: '2026-11-01T10:00:00.000Z' }),
  );

/** The markup `consent-banner.ts` renders (kept in sync by the API's own tests). */
function renderBanner(): void {
  document.body.innerHTML = `
<section class="consent" data-consent-banner hidden>
<p data-consent-current data-allowed="You allowed counting on {date}." data-declined="You said no on {date}." hidden></p>
<button type="button" data-consent-choice="allowed">OK</button>
<button type="button" data-consent-choice="declined">No thanks</button>
</section>
<button type="button" data-consent-open hidden>Analytics</button>`;
}

const view = {
  website: 'site-1',
  hostname: 'gobbit.example',
  screen: '390x844',
  language: 'en',
  url: '/p/smith-family/i/0b8f2f4e-3c1a-4d2b-9e6f-1a2b3c4d5e6f?q=allergy',
  title: 'Peanut allergy plan · Smith family',
  referrer: 'https://news.example/thread/123?u=me',
  tag: 'x',
  id: 'someone',
};

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete win.__gobbitAnalyticsBeforeSend;
});

describe('public page before-send hook (D254, D257)', () => {
  it('sends the pattern, the screen name and the referrer origin only', () => {
    const hook = load({ ...SITE, pattern: '/p/:deck/i/:item', screen: 'Public card' });
    expect(hook('event', view)).toEqual({
      website: 'site-1',
      hostname: 'gobbit.example',
      screen: '390x844',
      language: 'en',
      url: '/p/:deck/i/:item',
      title: 'Public card',
      referrer: 'https://news.example',
    });
  });

  it('drops a same-origin or non-http referrer', () => {
    const hook = load({ ...SITE, pattern: '/p/:deck', screen: 'Public deck' });
    expect(hook('event', { ...view, referrer: `${window.location.origin}/p/x` })?.referrer).toBe(
      '',
    );
    expect(hook('event', { ...view, referrer: 'android-app://x' })?.referrer).toBe('');
  });

  it('cancels events, identify, offline sends and a pattern without a screen', () => {
    const hook = load({ ...SITE, pattern: '/p/:deck', screen: 'Public deck' });
    expect(hook('event', { ...view, name: 'card-shared', data: {} })).toBeNull();
    expect(hook('identify', view)).toBeNull();
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(hook('event', view)).toBeNull();
    offline.mockRestore();
    expect(load({ ...SITE, pattern: '/p/:deck' })('event', view)).toBeNull();
  });

  it('passes the landing payload as is (no pattern, 031)', () => {
    expect(load(SITE)('event', view)).toEqual(view);
  });
});

describe('visitor consent (D261, D264)', () => {
  it('injects the tracker when not answered, without Do Not Track', () => {
    load({ ...SITE, pattern: '/p/:deck', screen: 'Public deck' });
    const tag = tracker()!;
    expect(tag.dataset).toMatchObject({
      websiteId: 'site-1',
      hostUrl: '/stats',
      domains: 'gobbit.example',
      beforeSend: '__gobbitAnalyticsBeforeSend',
      excludeSearch: 'true',
      excludeHash: 'true',
    });
    expect(tag.hasAttribute('data-do-not-track')).toBe(false);
  });

  it('the landing tag has no exclude-* attributes', () => {
    load(SITE);
    expect(tracker()!.hasAttribute('data-exclude-search')).toBe(false);
  });

  it('a stored decline loads nothing and cancels every payload', () => {
    store('declined');
    const hook = load({ ...SITE, pattern: '/p/:deck', screen: 'Public deck' });
    expect(tracker()).toBeNull();
    expect(hook('event', view)).toBeNull();
  });

  it('unreadable or malformed storage counts as not answered', () => {
    localStorage.setItem(DEVICE_CONSENT_KEY, '{not json');
    load(SITE);
    expect(tracker()).not.toBeNull();
    document.head.innerHTML = '';
    localStorage.setItem(DEVICE_CONSENT_KEY, JSON.stringify({ value: 'declined' }));
    load(SITE);
    expect(tracker()).not.toBeNull();
  });

  it('shows the banner only while not answered and reveals the opener', () => {
    renderBanner();
    load(SITE);
    expect(banner().hidden).toBe(false);
    expect(opener().hidden).toBe(false);

    renderBanner();
    store('allowed');
    load(SITE);
    expect(banner().hidden).toBe(true);
  });

  it('“No thanks” stores the choice, hides the banner and cancels at once', () => {
    renderBanner();
    const hook = load(SITE);
    banner().querySelector<HTMLButtonElement>('[data-consent-choice="declined"]')!.click();
    expect(banner().hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem(DEVICE_CONSENT_KEY)!)).toMatchObject({
      value: 'declined',
    });
    expect(hook('event', view)).toBeNull();
  });

  it('“OK” after a decline injects the tracker without a reload', () => {
    renderBanner();
    store('declined');
    const hook = load(SITE);
    expect(tracker()).toBeNull();
    opener().click();
    expect(banner().hidden).toBe(false);
    expect(current().hidden).toBe(false);
    expect(current().textContent).toMatch(/^You said no on .+\.$/);
    banner().querySelector<HTMLButtonElement>('[data-consent-choice="allowed"]')!.click();
    expect(tracker()).not.toBeNull();
    expect(hook('event', view)).toEqual(view);
  });

  it('never puts the choice in a payload (FR-009)', () => {
    store('allowed');
    const hook = load({ ...SITE, pattern: '/p/:deck', screen: 'Public deck' });
    expect(JSON.stringify(hook('event', view))).not.toMatch(/allowed|consent/);
  });
});
