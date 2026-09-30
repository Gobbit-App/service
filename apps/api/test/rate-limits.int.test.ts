import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_CALLBACK_PER_IP,
  RATE_MAGIC_LINK_PER_EMAIL,
  RATE_MAGIC_LINK_PER_IP,
} from '@pb/shared';
import { createRateLimitsRepo } from '../src/repositories/rate-limits.repo';
import { createRateLimitService } from '../src/services/rate-limit.service';
import { RATE_WINDOW_MS, windowStart } from '../src/lib/rate-window';
import { json, OWNER_EMAIL, setupApiTest } from './helpers';

let ipSeq = 0;
const nextIp = () => `10.1.0.${++ipSeq}`;

describe('rate limits (P2.3, D39)', () => {
  const ctx = setupApiTest({ env: { CLIENT_IP_HEADER: 'x-test-ip' } });
  let ip: string;

  beforeEach(() => {
    ip = nextIp();
    ctx.mailer.clear();
    // Start each test just after a window boundary so a run never straddles two windows.
    const at = ctx.clock.now();
    ctx.clock.advance(windowStart(at).getTime() + RATE_WINDOW_MS - at.getTime() + 1_000);
  });
  afterEach(() => ctx.clock.reset());

  const requestLink = (email: string, from = ip) =>
    ctx.app.request('/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-ip': from },
      body: JSON.stringify({ email }),
    });

  async function exhaustEmail(email: string): Promise<void> {
    for (let i = 0; i < RATE_MAGIC_LINK_PER_EMAIL; i++) {
      expect((await requestLink(email)).status).toBe(200);
    }
  }

  it('the sixth request for one email is 429 with Retry-After', async () => {
    await exhaustEmail('limit-one@example.test');

    const res = await requestLink('limit-one@example.test');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await json(res)).type).toBe('/problems/rate-limited');
    expect(ctx.mailer.sent).toHaveLength(RATE_MAGIC_LINK_PER_EMAIL);
  });

  it('other emails from the same IP pass until the per-IP limit', async () => {
    await exhaustEmail('limit-ip-0@example.test');

    for (let i = RATE_MAGIC_LINK_PER_EMAIL; i < RATE_MAGIC_LINK_PER_IP; i++) {
      expect((await requestLink(`limit-ip-${i}@example.test`)).status).toBe(200);
    }
    expect((await requestLink('limit-ip-last@example.test')).status).toBe(429);
  });

  it('the next window allows requests again', async () => {
    await exhaustEmail('limit-reset@example.test');
    expect((await requestLink('limit-reset@example.test')).status).toBe(429);

    ctx.clock.advance(RATE_WINDOW_MS);
    expect((await requestLink('limit-reset@example.test')).status).toBe(200);
  });

  it('an unknown and a known email produce identical limited bodies', async () => {
    const unknown = 'nobody-here@example.test';
    await exhaustEmail(unknown);
    const unknownBody = await (await requestLink(unknown)).text();

    ip = nextIp();
    await exhaustEmail(OWNER_EMAIL);
    const knownBody = await (await requestLink(OWNER_EMAIL)).text();

    expect(knownBody).toBe(unknownBody);
  });

  it('callbacks with garbage tokens are limited per IP', async () => {
    for (let i = 0; i < RATE_CALLBACK_PER_IP; i++) {
      const res = await ctx.app.request(`/auth/callback?token=garbage${i}`, {
        headers: { 'x-test-ip': ip },
      });
      expect(res.status).toBe(401);
    }
    const res = await ctx.app.request('/auth/callback?token=garbage-last', {
      headers: { 'x-test-ip': ip },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
  });

  it('a purge removes counters older than two windows', async () => {
    const now = ctx.clock.now();
    const repo = createRateLimitsRepo(ctx.t.db);
    await repo.hit('purge:old', new Date(now.getTime() - 3 * RATE_WINDOW_MS));
    await repo.hit('purge:recent', windowStart(now));

    const service = createRateLimitService({ repo, now: () => now, random: () => 0 });
    await service.check('purge:trigger', 100);

    const { rows } = await ctx.t.pool.query(
      `SELECT key FROM rate_limit_counters WHERE window_start < $1`,
      [new Date(now.getTime() - 2 * RATE_WINDOW_MS)],
    );
    expect(rows).toEqual([]);
    const recent = await ctx.t.pool.query(
      `SELECT key FROM rate_limit_counters WHERE key = 'purge:recent'`,
    );
    expect(recent.rows).toHaveLength(1);
  });
});
