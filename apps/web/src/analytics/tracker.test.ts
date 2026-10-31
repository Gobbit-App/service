import { afterEach, describe, expect, it } from 'vitest';
import type { Screen } from '@gobbit/shared/analytics';
import { installTracker } from './tracker';

const MEMBER = '0b8f2f4e-3c1a-4d2b-9e6f-1a2b3c4d5e6f';
type HookWindow = Window & {
  umami?: unknown;
  __gobbitAnalyticsBeforeSend?: (type: string, payload: unknown) => unknown;
};
const win = window as HookWindow;

afterEach(() => {
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  delete win.umami;
  delete win.__gobbitAnalyticsBeforeSend;
});

function install(screen: Screen | null = { pattern: '/d/:deck', name: 'Deck' }) {
  const result = installTracker({
    siteId: 'site-1',
    host: 'gobbit.example',
    getContext: () => ({
      screen,
      memberId: MEMBER,
      online: true,
      origin: 'https://gobbit.example',
    }),
  });
  const script = document.head.querySelector<HTMLScriptElement>('script')!;
  return { result, script };
}

describe('installTracker (D246, contract §2)', () => {
  it('appends the same-origin tracker with manual views and the before-send hook', () => {
    const { script } = install();
    expect(script.getAttribute('src')).toBe('/stats/script.js');
    expect(script.defer).toBe(true);
    expect({ ...script.dataset }).toEqual({
      websiteId: 'site-1',
      hostUrl: '/stats',
      domains: 'gobbit.example',
      doNotTrack: 'true',
      autoTrack: 'false',
      excludeSearch: 'true',
      excludeHash: 'true',
      beforeSend: '__gobbitAnalyticsBeforeSend',
    });
  });

  it('the hook rewrites a payload to the pattern and drops the real title', () => {
    install();
    const out = win.__gobbitAnalyticsBeforeSend!('event', {
      website: 'site-1',
      url: '/d/smith-family?q=allergy',
      title: 'Smith family',
    });
    expect(out).toMatchObject({ url: '/d/:deck', title: 'Deck', id: MEMBER });
    expect(JSON.stringify(out)).not.toMatch(/smith|allergy/i);
  });

  it('the hook cancels on an untracked screen', () => {
    install(null);
    expect(win.__gobbitAnalyticsBeforeSend!('event', { url: '/sign-in' })).toBeNull();
  });

  it('resolves to window.umami on load, null on error', async () => {
    const umami = { track: () => {}, identify: () => {} };
    const first = install();
    win.umami = umami;
    first.script.dispatchEvent(new Event('load'));
    await expect(first.result).resolves.toBe(umami);

    first.script.remove();
    const second = install();
    second.script.dispatchEvent(new Event('error'));
    await expect(second.result).resolves.toBeNull();
  });
});
