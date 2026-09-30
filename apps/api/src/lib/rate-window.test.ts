import { describe, it, expect } from 'vitest';
import {
  RATE_WINDOW_MS,
  isOverLimit,
  rateKeys,
  retryAfterSeconds,
  windowStart,
} from './rate-window';

describe('rate-window', () => {
  describe('RATE_WINDOW_MS', () => {
    it('should be 3600000 (one hour)', () => {
      expect(RATE_WINDOW_MS).toBe(3_600_000);
    });
  });

  describe('windowStart', () => {
    it('should return 10:00:00.000Z for 10:59:59.999Z', () => {
      const now = new Date('2026-01-01T10:59:59.999Z');
      const result = windowStart(now);
      expect(result.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    });

    it('should return 11:00:00.000Z for 11:00:00.000Z', () => {
      const now = new Date('2026-01-01T11:00:00.000Z');
      const result = windowStart(now);
      expect(result.toISOString()).toBe('2026-01-01T11:00:00.000Z');
    });
  });

  describe('retryAfterSeconds', () => {
    it('should return 3600 at 10:00:00.000Z', () => {
      const now = new Date('2026-01-01T10:00:00.000Z');
      const result = retryAfterSeconds(now);
      expect(result).toBe(3600);
    });

    it('should return 1 at 10:59:59.500Z', () => {
      const now = new Date('2026-01-01T10:59:59.500Z');
      const result = retryAfterSeconds(now);
      expect(result).toBe(1);
    });

    it('should return 1800 at 10:30:00Z', () => {
      const now = new Date('2026-01-01T10:30:00.000Z');
      const result = retryAfterSeconds(now);
      expect(result).toBe(1800);
    });
  });

  describe('isOverLimit', () => {
    it('should return false when count equals limit (5, 5)', () => {
      expect(isOverLimit(5, 5)).toBe(false);
    });

    it('should return true when count exceeds limit (6, 5)', () => {
      expect(isOverLimit(6, 5)).toBe(true);
    });
  });

  describe('rateKeys', () => {
    it('should generate magic-link:email:<hash> format', () => {
      const key = rateKeys.magicLinkEmail('abc123');
      expect(key).toBe('magic-link:email:abc123');
    });

    it('should generate magic-link:ip:<ip> format', () => {
      const key = rateKeys.magicLinkIp('192.168.1.1');
      expect(key).toBe('magic-link:ip:192.168.1.1');
    });

    it('should generate callback:ip:<ip> format', () => {
      const key = rateKeys.callbackIp('10.0.0.1');
      expect(key).toBe('callback:ip:10.0.0.1');
    });
  });
});
