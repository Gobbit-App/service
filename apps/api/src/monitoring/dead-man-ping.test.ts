import { describe, it, expect, vi } from 'vitest';
import { createDeadManPing } from './dead-man-ping';
import type { Logger } from '../lib/logger';

function setup(responses: Array<number | Error> = []) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body });
    const next = responses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return new Response(null, { status: next });
  }) as unknown as typeof globalThis.fetch;
  const log = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;
  let time = 1_000_000;
  const clock = {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
  const ping = createDeadManPing({
    url: 'https://hc-ping.com/uuid/',
    log,
    fetch,
    now: clock.now,
    minIntervalMs: 60_000,
  });
  return { ping, calls, log, clock };
}

describe('createDeadManPing', () => {
  it('pings the base URL (trailing slash trimmed) on ok', async () => {
    const { ping, calls } = setup();
    await ping.ok();
    expect(calls).toEqual([{ url: 'https://hc-ping.com/uuid', body: undefined }]);
  });

  it('pings at most once per interval', async () => {
    const { ping, calls, clock } = setup();
    await ping.ok();
    clock.advance(30_000);
    await ping.ok();
    clock.advance(30_000);
    await ping.ok();
    expect(calls).toHaveLength(2);
  });

  it('retries on the next heartbeat after a failed ping', async () => {
    const { ping, calls, clock } = setup([new Error('offline'), 200]);
    await ping.ok();
    clock.advance(30_000);
    await ping.ok();
    expect(calls).toHaveLength(2);
  });

  it('treats a non-2xx answer as a failed ping', async () => {
    const { ping, log } = setup([500]);
    await ping.ok();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('sends /fail with a truncated reason, always, and resets the interval', async () => {
    const { ping, calls, clock } = setup();
    await ping.ok();
    clock.advance(1_000);
    await ping.fail('x'.repeat(500));
    clock.advance(1_000);
    await ping.ok();
    expect(calls.map((c) => c.url)).toEqual([
      'https://hc-ping.com/uuid',
      'https://hc-ping.com/uuid/fail',
      'https://hc-ping.com/uuid',
    ]);
    expect(String(calls[1]?.body)).toHaveLength(200);
  });

  it('never throws and logs only reachability changes', async () => {
    const err = new Error('offline');
    const { ping, log, clock } = setup([err, err, err, 200]);
    for (let i = 0; i < 4; i += 1) {
      await expect(ping.ok()).resolves.toBeUndefined();
      clock.advance(60_000);
    }
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledTimes(1);
  });
});
