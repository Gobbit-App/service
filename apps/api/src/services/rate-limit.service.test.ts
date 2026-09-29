import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HttpError } from '../errors/http-errors';
import { RATE_WINDOW_MS, windowStart } from '../lib/rate-window';
import { createRateLimitService, PURGE_PROBABILITY } from './rate-limit.service';

const NOW = new Date('2026-01-10T12:30:00.000Z');

describe('createRateLimitService', () => {
  let repo: { hit: ReturnType<typeof vi.fn>; purgeBefore: ReturnType<typeof vi.fn> };
  let random: Mock<() => number>;
  let service: ReturnType<typeof createRateLimitService>;

  beforeEach(() => {
    repo = { hit: vi.fn(), purgeBefore: vi.fn().mockResolvedValue(undefined) };
    random = vi.fn<() => number>().mockReturnValue(0.5);
    service = createRateLimitService({ repo: repo as any, now: () => NOW, random });
  });

  describe('check', () => {
    it('hits the current window and allows a count at the limit', async () => {
      repo.hit.mockResolvedValue(5);
      const result = await service.check('k', 5);
      expect(repo.hit).toHaveBeenCalledWith('k', windowStart(NOW));
      expect(result.allowed).toBe(true);
    });

    it('disallows a count over the limit and reports retry-after', async () => {
      repo.hit.mockResolvedValue(6);
      const result = await service.check('k', 5);
      expect(result).toEqual({ allowed: false, retryAfterSeconds: 1800 });
    });

    it('does not purge when random() >= PURGE_PROBABILITY', async () => {
      repo.hit.mockResolvedValue(1);
      random.mockReturnValue(PURGE_PROBABILITY);
      await service.check('k', 5);
      expect(repo.purgeBefore).not.toHaveBeenCalled();
    });

    it('purges counters two windows back when random() < PURGE_PROBABILITY', async () => {
      repo.hit.mockResolvedValue(1);
      random.mockReturnValue(PURGE_PROBABILITY - 0.001);
      await service.check('k', 5);
      expect(repo.purgeBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 2 * RATE_WINDOW_MS));
    });
  });

  describe('enforce', () => {
    it('resolves when under the limit', async () => {
      repo.hit.mockResolvedValue(1);
      await expect(service.enforce('k', 5)).resolves.toBeUndefined();
    });

    it('throws 429 with Retry-After when over the limit', async () => {
      repo.hit.mockResolvedValue(6);
      const err = await service.enforce('k', 5).catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(429);
      expect(err.headers).toEqual({ 'Retry-After': '1800' });
    });
  });
});
