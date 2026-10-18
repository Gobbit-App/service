import { describe, expect, it } from 'vitest';
import { bearerWithPrefix, createPrefixedToken, hasPrefix } from './prefixed-token';
import { hashToken } from './tokens';

const BODY = 'a'.repeat(43);

describe('prefixed-token (D-token)', () => {
  it('createPrefixedToken mints prefix + 43-char body, hash and display prefix', () => {
    const minted = createPrefixedToken('tst_', 8);
    expect(minted.token).toMatch(/^tst_[A-Za-z0-9_-]{43}$/);
    expect(minted.hash).toBe(hashToken(minted.token));
    expect(minted.prefix).toBe(minted.token.slice(0, 8));
    expect(createPrefixedToken('tst_', 8).token).not.toBe(minted.token);
  });

  it('hasPrefix accepts a well-formed prefixed token', () => {
    expect(hasPrefix(`tst_${BODY}`, 'tst_')).toBe(true);
  });

  it('hasPrefix rejects wrong prefix, wrong body lengths and invalid characters', () => {
    expect(hasPrefix(`abc_${BODY}`, 'tst_')).toBe(false);
    expect(hasPrefix(`tst_${'a'.repeat(42)}`, 'tst_')).toBe(false);
    expect(hasPrefix(`tst_${'a'.repeat(44)}`, 'tst_')).toBe(false);
    expect(hasPrefix(`tst_${'a'.repeat(42)}.`, 'tst_')).toBe(false);
    expect(hasPrefix(`tst_${'a'.repeat(42)}+`, 'tst_')).toBe(false);
  });

  it('bearerWithPrefix returns the token from a Bearer header', () => {
    const token = `tst_${BODY}`;
    expect(bearerWithPrefix(`Bearer ${token}`, 'tst_')).toBe(token);
  });

  it('bearerWithPrefix is case-insensitive on scheme and trims whitespace', () => {
    const token = `tst_${BODY}`;
    expect(bearerWithPrefix(`bearer   ${token}  `, 'tst_')).toBe(token);
  });

  it('bearerWithPrefix returns null for missing or empty headers', () => {
    expect(bearerWithPrefix(undefined, 'tst_')).toBeNull();
    expect(bearerWithPrefix(null, 'tst_')).toBeNull();
    expect(bearerWithPrefix('', 'tst_')).toBeNull();
  });

  it('bearerWithPrefix returns null for other schemes, other tokens or extra parts', () => {
    expect(bearerWithPrefix(`Basic tst_${BODY}`, 'tst_')).toBeNull();
    expect(bearerWithPrefix('Bearer other', 'tst_')).toBeNull();
    expect(bearerWithPrefix(`Bearer tst_${BODY} extra`, 'tst_')).toBeNull();
  });
});
