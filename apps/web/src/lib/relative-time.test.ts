import { describe, it, expect } from 'vitest';
import { relativeTime, checkedAgo } from './relative-time';

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

describe('checkedAgo', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('should return null when verifiedAt is null', () => {
    const result = checkedAgo(null, now);
    expect(result).toBeNull();
  });

  it('should return null when verifiedAt is unparsable', () => {
    const result = checkedAgo('garbage', now);
    expect(result).toBeNull();
  });

  it('should format 21 days earlier as checked 3 weeks ago', () => {
    const verifiedAt = '2026-09-15T12:00:00Z';
    const result = checkedAgo(verifiedAt, now);
    expect(result).toBe('checked 3 weeks ago');
  });

  it('should format 1 day earlier as checked yesterday', () => {
    const verifiedAt = '2026-10-05T12:00:00Z';
    const result = checkedAgo(verifiedAt, now);
    expect(result).toBe('checked yesterday');
  });

  it('should format 2 hours earlier as checked 2 hours ago', () => {
    const verifiedAt = '2026-10-06T10:00:00Z';
    const result = checkedAgo(verifiedAt, now);
    expect(result).toBe('checked 2 hours ago');
  });

  it('should format 400 days earlier with year unit', () => {
    const verifiedAt = '2025-01-01T12:00:00Z';
    const result = checkedAgo(verifiedAt, now);
    expect(result).toMatch(/year/);
  });

  it('should format 10 seconds earlier', () => {
    const verifiedAt = '2026-10-06T11:59:50Z';
    const result = checkedAgo(verifiedAt, now);
    expect(result).toMatch(/second|now/);
  });
});
