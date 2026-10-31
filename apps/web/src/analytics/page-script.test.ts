import { afterEach, describe, expect, it, vi } from 'vitest';
import source from '../../public/analytics/page.js?raw';

type Hook = (type: string, payload: unknown) => Record<string, unknown> | null;
type HookWindow = Window & { __gobbitAnalyticsBeforeSend?: Hook };
const win = window as HookWindow;

/** Runs page.js as the browser would, with its own `<script data-…>` as `currentScript`. */
function load(dataset: Record<string, string>): Hook {
  const script = document.createElement('script');
  Object.assign(script.dataset, dataset);
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  new Function(source)();
  return win.__gobbitAnalyticsBeforeSend!;
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

afterEach(() => {
  vi.restoreAllMocks();
  delete win.__gobbitAnalyticsBeforeSend;
});

describe('public page before-send hook (D246, D249)', () => {
  it('sends the pattern, the screen name and the referrer origin only', () => {
    const hook = load({ pattern: '/p/:deck/i/:item', screen: 'Public card' });
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
    const hook = load({ pattern: '/p/:deck', screen: 'Public deck' });
    expect(hook('event', { ...view, referrer: `${window.location.origin}/p/x` })?.referrer).toBe(
      '',
    );
    expect(hook('event', { ...view, referrer: 'android-app://x' })?.referrer).toBe('');
  });

  it('cancels events, identify, offline sends and pages without a pattern', () => {
    const hook = load({ pattern: '/p/:deck', screen: 'Public deck' });
    expect(hook('event', { ...view, name: 'card-shared', data: {} })).toBeNull();
    expect(hook('identify', view)).toBeNull();
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(hook('event', view)).toBeNull();
    offline.mockRestore();
    expect(load({})('event', view)).toBeNull();
  });
});
