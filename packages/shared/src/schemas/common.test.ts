import { describe, it, expect } from 'vitest';
import { slugSchema, httpUrlSchema, nameSchema } from './common';

describe('common schemas', () => {
  describe('slugSchema', () => {
    it('accepts valid slugs', () => {
      expect(slugSchema.parse('family')).toBe('family');
      expect(slugSchema.parse('my-deck-2')).toBe('my-deck-2');
    });

    it('rejects empty string', () => {
      expect(() => slugSchema.parse('')).toThrow();
    });

    it('rejects uppercase letters', () => {
      expect(() => slugSchema.parse('Family')).toThrow();
    });

    it('rejects leading dash', () => {
      expect(() => slugSchema.parse('-a')).toThrow();
    });

    it('rejects trailing dash', () => {
      expect(() => slugSchema.parse('a-')).toThrow();
    });

    it('rejects consecutive dashes', () => {
      expect(() => slugSchema.parse('a--b')).toThrow();
    });

    it('rejects non-ASCII characters', () => {
      expect(() => slugSchema.parse('שלום')).toThrow();
    });

    it('rejects slug exceeding 60 characters', () => {
      const slug61 = 'a'.repeat(61);
      expect(() => slugSchema.parse(slug61)).toThrow();
    });
  });

  describe('httpUrlSchema', () => {
    it('accepts https URLs', () => {
      expect(httpUrlSchema.parse('https://example.com')).toBe('https://example.com');
    });

    it('accepts http URLs', () => {
      expect(httpUrlSchema.parse('http://x.test/a')).toBe('http://x.test/a');
    });

    it('rejects javascript protocol', () => {
      expect(() => httpUrlSchema.parse('javascript:alert(1)')).toThrow();
    });

    it('rejects ftp protocol', () => {
      expect(() => httpUrlSchema.parse('ftp://x.test')).toThrow();
    });

    it('rejects invalid URLs', () => {
      expect(() => httpUrlSchema.parse('not a url')).toThrow();
    });
  });

  describe('nameSchema', () => {
    it('accepts valid names', () => {
      expect(nameSchema.parse('My Name')).toBe('My Name');
    });

    it('trims whitespace', () => {
      expect(nameSchema.parse('  name  ')).toBe('name');
    });

    it('rejects whitespace-only strings', () => {
      expect(() => nameSchema.parse('   ')).toThrow();
    });

    it('rejects names exceeding 80 characters', () => {
      const name81 = 'a'.repeat(81);
      expect(() => nameSchema.parse(name81)).toThrow();
    });
  });
});
