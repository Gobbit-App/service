import { describe, it, expect } from 'vitest';
import { generateToken, hashToken, hashesEqual } from './tokens';

describe('tokens', () => {
  describe('generateToken', () => {
    it('generates a 43-char token matching base64url pattern', () => {
      const token = generateToken();
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('generates 100 unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('is deterministic', () => {
      const token = 'test-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('returns a 64-char lowercase hex string', () => {
      const hash = hashToken('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('correctly hashes "abc"', () => {
      const hash = hashToken('abc');
      expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
  });

  describe('hashesEqual', () => {
    it('returns true for equal hashes', () => {
      const hash = hashToken('test');
      expect(hashesEqual(hash, hash)).toBe(true);
    });

    it('returns false for different same-length strings', () => {
      const hash1 = hashToken('test1');
      const hash2 = hashToken('test2');
      expect(hashesEqual(hash1, hash2)).toBe(false);
    });

    it('returns false for different length strings', () => {
      expect(hashesEqual('short', 'longer-string')).toBe(false);
    });
  });
});
