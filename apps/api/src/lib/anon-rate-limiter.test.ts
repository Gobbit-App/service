import { describe, it, expect } from 'vitest';
import { createAnonRateLimiter } from './anon-rate-limiter';

const t0 = new Date('2026-10-24T10:00:00.000Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);

describe('createAnonRateLimiter (D175)', () => {
  it('allows up to the limit per key, then refuses', () => {
    const limiter = createAnonRateLimiter({ limit: 2 });
    expect(limiter.hit('1.1.1.1', t0).allowed).toBe(true);
    expect(limiter.hit('1.1.1.1', t0).allowed).toBe(true);
    expect(limiter.hit('1.1.1.1', t0).allowed).toBe(false);
  });

  it('counts keys separately', () => {
    const limiter = createAnonRateLimiter({ limit: 1 });
    expect(limiter.hit('1.1.1.1', t0).allowed).toBe(true);
    expect(limiter.hit('2.2.2.2', t0).allowed).toBe(true);
    expect(limiter.hit('1.1.1.1', t0).allowed).toBe(false);
  });

  it('starts a new window on the hour', () => {
    const limiter = createAnonRateLimiter({ limit: 1 });
    expect(limiter.hit('1.1.1.1', plus(59 * 60_000)).allowed).toBe(true);
    expect(limiter.hit('1.1.1.1', plus(59 * 60_000 + 1)).allowed).toBe(false);
    expect(limiter.hit('1.1.1.1', plus(60 * 60_000)).allowed).toBe(true);
  });

  it('reports seconds until the window ends', () => {
    const limiter = createAnonRateLimiter({ limit: 0 });
    const result = limiter.hit('1.1.1.1', plus(30 * 60_000));
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(30 * 60);
  });

  it('evicts the least recently used key past max, which then starts fresh', () => {
    const limiter = createAnonRateLimiter({ limit: 1, max: 2 });
    limiter.hit('a', t0);
    limiter.hit('b', t0);
    limiter.hit('c', t0); // evicts 'a'
    expect(limiter.hit('a', t0).allowed).toBe(true);
    expect(limiter.hit('c', t0).allowed).toBe(false);
  });
});
