import { describe, it, expect } from 'vitest';
import { safeNext, signInHref, postSignInTarget } from './session-redirect';

describe('safeNext', () => {
  it('accepts valid paths', () => {
    expect(safeNext('/d/x')).toBe('/d/x');
    expect(safeNext('/d/x?y=1')).toBe('/d/x?y=1');
    expect(safeNext('/foo')).toBe('/foo');
  });

  it('rejects /', () => {
    expect(safeNext('/')).toBeNull();
  });

  it('rejects //evil.com', () => {
    expect(safeNext('//evil.com')).toBeNull();
  });

  it('rejects /\\evil (backslash)', () => {
    expect(safeNext('/\\evil')).toBeNull();
  });

  it('rejects https://evil.com', () => {
    expect(safeNext('https://evil.com')).toBeNull();
  });

  it('rejects /sign-in?next=/x', () => {
    expect(safeNext('/sign-in?next=/x')).toBeNull();
  });

  it('rejects /auth/error', () => {
    expect(safeNext('/auth/error')).toBeNull();
  });

  it('rejects paths with newline', () => {
    expect(safeNext('/d/x\n')).toBeNull();
  });

  it('rejects 600-char path', () => {
    const longPath = '/' + 'a'.repeat(599);
    expect(safeNext(longPath)).toBeNull();
  });

  it('accepts 512-char path', () => {
    const path = '/' + 'a'.repeat(511);
    expect(safeNext(path)).toBe(path);
  });

  it('rejects non-strings', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(123)).toBeNull();
  });
});

describe('signInHref', () => {
  it('returns /sign-in?next=%2Fd%2Fx for /d/x', () => {
    expect(signInHref('/d/x')).toBe('/sign-in?next=%2Fd%2Fx');
  });

  it('returns /sign-in for /', () => {
    expect(signInHref('/')).toBe('/sign-in');
  });

  it('returns /sign-in for //evil.com', () => {
    expect(signInHref('//evil.com')).toBe('/sign-in');
  });

  it('returns /sign-in?next=%2Fd%2Fx%3Fy%3D1 for /d/x?y=1', () => {
    expect(signInHref('/d/x?y=1')).toBe('/sign-in?next=%2Fd%2Fx%3Fy%3D1');
  });
});

describe('postSignInTarget', () => {
  it('returns / for undefined', () => {
    expect(postSignInTarget(undefined)).toBe('/');
  });

  it('returns / for invalid next', () => {
    expect(postSignInTarget(null)).toBe('/');
    expect(postSignInTarget('//evil.com')).toBe('/');
  });

  it('returns the safe next path', () => {
    expect(postSignInTarget('/d/x')).toBe('/d/x');
    expect(postSignInTarget('/d/x?y=1')).toBe('/d/x?y=1');
  });
});
