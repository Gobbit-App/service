import { describe, expect, it, vi } from 'vitest';
import type { LinkCheckRow } from '@gobbit/db';
import {
  LINK_CHECK_INTERVAL_DAYS,
  LINK_CHECK_JITTER_DAYS,
  LINK_CHECK_RETRY_DAYS,
} from '@gobbit/shared';
import type { DueLink, LinkCheckWrite } from '../repositories/link-checks.repo';
import {
  createLinkChecksService,
  createLinkProbe,
  nextCheckState,
  uncheckedState,
  type LinkProbe,
} from './link-checks.service';

const DAY = 86_400_000;
const now = new Date('2026-11-20T06:30:00.000Z');
const earlier = new Date('2026-10-01T06:30:00.000Z');
const okProbe: LinkProbe = { result: { status: 200, error: null }, title: 'Dan the Plumber' };
const notFound: LinkProbe = { result: { status: 404, error: 'http_404' }, title: null };
const timeout: LinkProbe = { result: { status: null, error: 'timeout' }, title: null };

function row(o: Partial<LinkCheckRow> = {}): LinkCheckRow {
  return {
    itemId: 'i1',
    status: 'ok',
    httpStatus: 200,
    error: null,
    titleSeen: 'dan the plumber',
    consecutiveFailures: 0,
    checkedAt: earlier,
    nextCheckAt: now,
    flaggedAt: null,
    dismissedAt: null,
    ...o,
  };
}

const step = (
  prev: LinkCheckRow | null,
  cls: 'ok' | 'changed' | 'definite' | 'temporary',
  probe: LinkProbe,
  manual = false,
  random = 0.5,
) => nextCheckState({ prev, cls, probe, now, manual, random });

const daysAfterNow = (d: Date) => (d.getTime() - now.getTime()) / DAY;

describe('nextCheckState (D164)', () => {
  it('first ok check: no flag, next check in the interval', () => {
    const s = step(null, 'ok', okProbe);
    expect(s).toMatchObject({
      status: 'ok',
      consecutiveFailures: 0,
      httpStatus: 200,
      titleSeen: 'dan the plumber',
      flaggedAt: null,
      checkedAt: now,
    });
    expect(daysAfterNow(s.nextCheckAt)).toBe(LINK_CHECK_INTERVAL_DAYS);
  });

  it('spreads the next check by the jitter', () => {
    expect(daysAfterNow(step(null, 'ok', okProbe, false, 0).nextCheckAt)).toBe(
      LINK_CHECK_INTERVAL_DAYS - LINK_CHECK_JITTER_DAYS,
    );
    expect(daysAfterNow(step(null, 'ok', okProbe, false, 1).nextCheckAt)).toBe(
      LINK_CHECK_INTERVAL_DAYS + LINK_CHECK_JITTER_DAYS,
    );
  });

  it('two definite failures in a row make a link dead; the first retries the next day', () => {
    const first = step(row(), 'definite', notFound);
    expect(first).toMatchObject({ status: 'ok', consecutiveFailures: 1, flaggedAt: null });
    expect(daysAfterNow(first.nextCheckAt)).toBe(LINK_CHECK_RETRY_DAYS);
    expect(first.titleSeen).toBe('dan the plumber');

    const second = step(row(first as Partial<LinkCheckRow>), 'definite', notFound);
    expect(second).toMatchObject({ status: 'dead', consecutiveFailures: 2, flaggedAt: now });
    expect(daysAfterNow(second.nextCheckAt)).toBe(LINK_CHECK_INTERVAL_DAYS);
  });

  it('a temporary failure changes neither the status nor the strike count', () => {
    const s = step(row({ consecutiveFailures: 1 }), 'temporary', timeout);
    expect(s).toMatchObject({ status: 'ok', consecutiveFailures: 1, error: 'timeout' });
    expect(daysAfterNow(s.nextCheckAt)).toBe(LINK_CHECK_INTERVAL_DAYS);
  });

  it('a manual check counts the strike but never makes a link dead (D165)', () => {
    const s = step(row({ consecutiveFailures: 1 }), 'definite', notFound, true);
    expect(s).toMatchObject({ status: 'ok', consecutiveFailures: 2, flaggedAt: null });
    expect(daysAfterNow(s.nextCheckAt)).toBe(LINK_CHECK_RETRY_DAYS);
  });

  it('a manual check can set changed and clear a flag', () => {
    expect(step(row(), 'changed', okProbe, true)).toMatchObject({
      status: 'changed',
      flaggedAt: now,
    });
    expect(
      step(
        row({ status: 'dead', flaggedAt: earlier, consecutiveFailures: 2 }),
        'ok',
        okProbe,
        true,
      ),
    ).toMatchObject({ status: 'ok', consecutiveFailures: 0, flaggedAt: null, dismissedAt: null });
  });

  it('keeps a dismissal while the status is unchanged, and re-flags on a new status', () => {
    const dismissed = row({ status: 'changed', flaggedAt: earlier, dismissedAt: earlier });
    expect(step(dismissed, 'changed', okProbe)).toMatchObject({
      flaggedAt: earlier,
      dismissedAt: earlier,
    });
    expect(step(dismissed, 'temporary', timeout)).toMatchObject({
      status: 'changed',
      dismissedAt: earlier,
    });
    const dead = step(
      row({ ...dismissed, consecutiveFailures: 1 } as Partial<LinkCheckRow>),
      'definite',
      notFound,
    );
    expect(dead).toMatchObject({ status: 'dead', flaggedAt: now, dismissedAt: null });
  });

  it('clips the error text', () => {
    const long = {
      result: { status: null, error: `fetch_failed: ${'x'.repeat(400)}` },
      title: null,
    };
    expect(Array.from(step(null, 'temporary', long).error!)).toHaveLength(200);
  });
});

describe('linkChecks.sweep (D164)', () => {
  function due(id: string, url: string): DueLink {
    return { itemId: id, url, previewTitle: 'Dan the Plumber', check: null };
  }

  function harness(links: DueLink[], probeFor: (url: string) => LinkProbe) {
    const inFlight = new Map<string, number>();
    let maxPerHost = 0;
    let maxHosts = 0;
    const probe = vi.fn(async (url: string) => {
      const host = new URL(url).hostname;
      inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
      maxPerHost = Math.max(maxPerHost, inFlight.get(host)!);
      maxHosts = Math.max(maxHosts, inFlight.size);
      await new Promise((r) => setTimeout(r, 5));
      const n = inFlight.get(host)! - 1;
      if (n === 0) inFlight.delete(host);
      else inFlight.set(host, n);
      return probeFor(url);
    });
    const writes: { itemId: string; v: LinkCheckWrite }[] = [];
    const linkChecks = {
      due: vi.fn(async () => links),
      upsert: vi.fn(async (itemId: string, v: LinkCheckWrite) => {
        writes.push({ itemId, v });
        return { itemId, ...v };
      }),
    };
    const log = vi.fn();
    const service = createLinkChecksService({
      linkChecks,
      probe,
      now: () => now,
      random: () => 0.5,
      log,
    });
    return {
      service,
      probe,
      linkChecks,
      writes,
      log,
      stats: () => ({ maxPerHost, maxHosts }),
    };
  }

  it('checks every due link, one request per host at a time, hosts in parallel', async () => {
    const links = [
      ...['a', 'b', 'c'].map((n) => due(`a-${n}`, `https://a.test/${n}`)),
      ...['a', 'b'].map((n) => due(`b-${n}`, `https://b.test/${n}`)),
      ...Array.from({ length: 6 }, (_, i) => due(`h${i}`, `https://h${i}.test/`)),
    ];
    const h = harness(links, () => okProbe);
    const summary = await h.service.sweep();

    expect(h.linkChecks.due).toHaveBeenCalledWith(now, 100);
    expect(h.probe).toHaveBeenCalledTimes(links.length);
    expect(h.stats().maxPerHost).toBe(1);
    expect(h.stats().maxHosts).toBeGreaterThan(1);
    expect(h.stats().maxHosts).toBeLessThanOrEqual(4);
    expect(summary).toEqual({
      checked: 11,
      ok: 11,
      changed: 0,
      dead: 0,
      failing: 0,
      failedTemp: 0,
      unchecked: 0,
    });
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('"checked":11'));
  });

  it('summarizes each outcome', async () => {
    const struck = {
      ...due('dead', 'https://x.test/dead'),
      check: row({ consecutiveFailures: 1 }),
    };
    const h = harness(
      [
        due('ok', 'https://x.test/ok'),
        due('changed', 'https://x.test/changed'),
        due('failing', 'https://x.test/gone'),
        struck,
        due('temp', 'https://x.test/slow'),
      ],
      (url) =>
        url.endsWith('/changed')
          ? { result: { status: 200, error: null }, title: 'Domain for sale' }
          : url.endsWith('/gone') || url.endsWith('/dead')
            ? notFound
            : url.endsWith('/slow')
              ? timeout
              : okProbe,
    );
    expect(await h.service.sweep()).toEqual({
      checked: 5,
      ok: 1,
      changed: 1,
      dead: 1,
      failing: 1,
      failedTemp: 1,
      unchecked: 0,
    });
  });

  it('never probes a locked host and records it unchecked (D168)', async () => {
    const prev = {
      ...due('ig', 'https://www.instagram.com/p/abc/'),
      check: row({ status: 'dead', flaggedAt: earlier }),
    };
    const h = harness([prev, due('ok', 'https://x.test/ok')], () => okProbe);
    const summary = await h.service.sweep();
    expect(h.probe).toHaveBeenCalledTimes(1);
    expect(h.probe).not.toHaveBeenCalledWith(prev.url);
    expect(summary).toMatchObject({ checked: 2, ok: 1, unchecked: 1 });
    const write = h.writes.find((w) => w.itemId === 'ig')!.v;
    expect(write).toMatchObject({
      status: 'unchecked',
      httpStatus: null,
      error: null,
      titleSeen: null,
      consecutiveFailures: 0,
      flaggedAt: null,
      dismissedAt: null,
    });
    expect(daysAfterNow(write.nextCheckAt)).toBe(LINK_CHECK_INTERVAL_DAYS);
  });
});

describe('uncheckedState (D168)', () => {
  it('spreads the next look by the jitter', () => {
    expect(daysAfterNow(uncheckedState(now, 0).nextCheckAt)).toBe(
      LINK_CHECK_INTERVAL_DAYS - LINK_CHECK_JITTER_DAYS,
    );
    expect(daysAfterNow(uncheckedState(now, 1).nextCheckAt)).toBe(
      LINK_CHECK_INTERVAL_DAYS + LINK_CHECK_JITTER_DAYS,
    );
  });
});

describe('createLinkProbe', () => {
  it('takes the OG title, else the page title, and none for non-HTML or failures', async () => {
    const extract = vi.fn((html: string) => ({
      title: 'Page',
      og: {
        title: html.includes('og') ? 'OG' : null,
        description: null,
        image: null,
        siteName: null,
      },
    }));
    const result = (html: string | null, error: string | null = null) => ({
      status: error ? 404 : 200,
      finalUrl: 'https://x.test/',
      ms: 1,
      html,
      error,
    });
    const probe = (html: string | null, error?: string) =>
      createLinkProbe({ safeFetch: async () => result(html, error ?? null), extract })(
        'https://x.test/',
      );

    expect((await probe('<og>')).title).toBe('OG');
    expect((await probe('<html>')).title).toBe('Page');
    expect((await probe(null)).title).toBeNull();
    expect((await probe(null, 'http_404')).result.error).toBe('http_404');
  });
});
