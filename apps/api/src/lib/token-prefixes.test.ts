import { INGEST_TOKEN_PREFIX } from '@gobbit/shared';
import { describe, expect, it } from 'vitest';
import { NON_SESSION_TOKEN_PREFIXES, nonSessionPrefixOf } from './token-prefixes';

describe('token-prefixes (D-token)', () => {
  it('registers the ingest token prefix as a non-session prefix', () => {
    expect(NON_SESSION_TOKEN_PREFIXES).toContain(INGEST_TOKEN_PREFIX);
  });

  it('nonSessionPrefixOf returns the registered prefix a value starts with', () => {
    expect(nonSessionPrefixOf(`${INGEST_TOKEN_PREFIX}x`)).toBe(INGEST_TOKEN_PREFIX);
  });

  it('nonSessionPrefixOf returns null for unregistered or empty values', () => {
    expect(nonSessionPrefixOf('abcdef')).toBeNull();
    expect(nonSessionPrefixOf('')).toBeNull();
  });

  it('every registered prefix is non-empty and ends with an underscore', () => {
    for (const prefix of NON_SESSION_TOKEN_PREFIXES) {
      expect(prefix.length).toBeGreaterThan(0);
      expect(prefix.endsWith('_')).toBe(true);
    }
  });
});
