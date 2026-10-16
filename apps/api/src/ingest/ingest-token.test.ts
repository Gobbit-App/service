import { describe, expect, it } from 'vitest';
import { hashToken } from '../lib/tokens';
import {
  bearerIngestToken,
  createIngestToken,
  ingestTokenFromLocalPart,
  isIngestToken,
  localPartFromToken,
} from './ingest-token';

describe('ingest-token (D-ingest)', () => {
  describe('createIngestToken', () => {
    it('starts with ing_ and is 47 chars long', () => {
      const { token } = createIngestToken();
      expect(token.startsWith('ing_')).toBe(true);
      expect(token).toHaveLength(47);
    });

    it('produces a token that isIngestToken accepts', () => {
      const { token } = createIngestToken();
      expect(isIngestToken(token)).toBe(true);
    });

    it('hash equals hashToken(token) and is 64 lowercase hex chars', () => {
      const { token, hash } = createIngestToken();
      expect(hash).toBe(hashToken(token));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('prefix is the first 8 chars of the token', () => {
      const { token, prefix } = createIngestToken();
      expect(prefix).toBe(token.slice(0, 8));
    });

    it('generates different tokens on each call', () => {
      const a = createIngestToken().token;
      const b = createIngestToken().token;
      expect(a).not.toBe(b);
    });
  });

  describe('isIngestToken', () => {
    it('rejects a short prefixed value', () => {
      expect(isIngestToken('ing_short')).toBe(false);
    });

    it('rejects a plain string', () => {
      expect(isIngestToken('abc')).toBe(false);
    });

    it('rejects a session-like 43-char token without the prefix', () => {
      expect(isIngestToken('a'.repeat(43))).toBe(false);
    });

    it('rejects ing_ followed by 43 chars containing +', () => {
      expect(isIngestToken('ing_' + 'a'.repeat(42) + '+')).toBe(false);
    });
  });

  describe('bearerIngestToken', () => {
    it('extracts the token from a Bearer header', () => {
      const { token } = createIngestToken();
      expect(bearerIngestToken('Bearer ' + token)).toBe(token);
    });

    it('accepts a lowercase scheme with extra whitespace', () => {
      const { token } = createIngestToken();
      expect(bearerIngestToken('bearer  ' + token + ' ')).toBe(token);
    });

    it('returns null for undefined', () => {
      expect(bearerIngestToken(undefined)).toBeNull();
    });

    it('returns null for a non-ingest bearer value', () => {
      expect(bearerIngestToken('Bearer xyz')).toBeNull();
    });

    it('returns null for a non-Bearer scheme', () => {
      const { token } = createIngestToken();
      expect(bearerIngestToken('Basic ' + token)).toBeNull();
    });
  });

  describe('ingestTokenFromLocalPart / localPartFromToken', () => {
    it('round-trips a token through its local part', () => {
      const { token } = createIngestToken();
      expect(ingestTokenFromLocalPart(localPartFromToken(token))).toBe(token);
    });

    it('returns null for an invalid local part', () => {
      expect(ingestTokenFromLocalPart('nope')).toBeNull();
    });
  });
});
