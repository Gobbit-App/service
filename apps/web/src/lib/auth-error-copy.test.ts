import { describe, it, expect } from 'vitest';
import { parseReason, authErrorCopy } from './auth-error-copy';

describe('parseReason', () => {
  it('should return "invalid" for "invalid"', () => {
    expect(parseReason('invalid')).toBe('invalid');
  });

  it('should return "used" for "used"', () => {
    expect(parseReason('used')).toBe('used');
  });

  it('should return "expired" for "expired"', () => {
    expect(parseReason('expired')).toBe('expired');
  });

  it('should return "unknown" for undefined', () => {
    expect(parseReason(undefined)).toBe('unknown');
  });

  it('should return "unknown" for 42', () => {
    expect(parseReason(42)).toBe('unknown');
  });

  it('should return "unknown" for other strings', () => {
    expect(parseReason('other')).toBe('unknown');
  });
});

describe('authErrorCopy', () => {
  it('should return correct copy for "invalid"', () => {
    const copy = authErrorCopy('invalid');
    expect(copy.title).toBe("That link doesn't work");
    expect(copy.body).toBe('The sign-in link is not valid. Request a new one below.');
  });

  it('should return correct copy for "used"', () => {
    const copy = authErrorCopy('used');
    expect(copy.title).toBe('That link was already used');
    expect(copy.body).toBe('Each sign-in link works once. Request a new one below.');
  });

  it('should return correct copy for "expired"', () => {
    const copy = authErrorCopy('expired');
    expect(copy.title).toBe('That link has expired');
    expect(copy.body).toBe('Sign-in links last 15 minutes. Request a new one below.');
  });

  it('should return correct copy for "unknown"', () => {
    const copy = authErrorCopy('unknown');
    expect(copy.title).toBe('Sign-in failed');
    expect(copy.body).toBe('Something went wrong. Request a new link below.');
  });
});
