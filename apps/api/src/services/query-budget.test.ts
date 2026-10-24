import { describe, expect, it, vi } from 'vitest';
import { createQueryBudget } from './query-budget';

const LIMITS = { perUser: 5, anonPerIp: 2, anonGlobal: 3 };

/** In-memory stand-in for the DB-backed counter: allowed while count ≤ limit. */
function fakeRateLimits() {
  const counts = new Map<string, number>();
  const check = vi.fn(async (key: string, limit: number) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { allowed: count <= limit, retryAfterSeconds: 1 };
  });
  return { check, counts };
}

describe('createQueryBudget (D76, D182)', () => {
  it('charges members to their own user key', async () => {
    const rateLimits = fakeRateLimits();
    const within = createQueryBudget(rateLimits, LIMITS);

    expect(await within({ kind: 'user', userId: 'u1' })).toBe(true);
    expect(rateLimits.check).toHaveBeenCalledWith('embed-query:user:u1', LIMITS.perUser);
  });

  it('charges strangers to their IP and the global key', async () => {
    const rateLimits = fakeRateLimits();
    const within = createQueryBudget(rateLimits, LIMITS);

    expect(await within({ kind: 'anon', ip: '203.0.113.1' })).toBe(true);
    expect(rateLimits.counts.get('embed-query:anon:ip:203.0.113.1')).toBe(1);
    expect(rateLimits.counts.get('embed-query:anon:global')).toBe(1);
  });

  it('denies a stranger over the per-IP budget without spending the global one', async () => {
    const rateLimits = fakeRateLimits();
    const within = createQueryBudget(rateLimits, LIMITS);
    const ip = { kind: 'anon', ip: '203.0.113.1' } as const;

    await within(ip);
    await within(ip);
    expect(await within(ip)).toBe(false);
    expect(rateLimits.counts.get('embed-query:anon:global')).toBe(2);
  });

  it('denies every stranger once the global budget is spent', async () => {
    const rateLimits = fakeRateLimits();
    const within = createQueryBudget(rateLimits, LIMITS);

    await within({ kind: 'anon', ip: '203.0.113.1' });
    await within({ kind: 'anon', ip: '203.0.113.1' });
    await within({ kind: 'anon', ip: '203.0.113.2' });
    expect(await within({ kind: 'anon', ip: '203.0.113.2' })).toBe(false);
    // Members are unaffected by the anonymous budgets.
    expect(await within({ kind: 'user', userId: 'u1' })).toBe(true);
  });
});
