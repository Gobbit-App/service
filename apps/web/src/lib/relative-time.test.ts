import { describe, it, expect } from 'vitest';
import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('should format 21 days earlier as 3 weeks ago', () => {
    const from = new Date('2026-09-15T12:00:00Z');
    const result = relativeTime(from, now);
    expect(result).toBe('3 weeks ago');
  });

  it('should format 1 day earlier as yesterday', () => {
    const from = new Date('2026-10-05T12:00:00Z');
    const result = relativeTime(from, now);
    expect(result).toBe('yesterday');
  });

  it('should format 2 hours earlier as 2 hours ago', () => {
    const from = new Date('2026-10-06T10:00:00Z');
    const result = relativeTime(from, now);
    expect(result).toBe('2 hours ago');
  });

  it('should format 400 days earlier with year unit', () => {
    const from = new Date('2025-01-01T12:00:00Z');
    const result = relativeTime(from, now);
    expect(result).toMatch(/year/);
  });

  it('should format 10 seconds earlier', () => {
    const from = new Date('2026-10-06T11:59:50Z');
    const result = relativeTime(from, now);
    expect(result).toMatch(/second|now/);
  });
});
