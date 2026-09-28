import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  encodeCursor,
  decodeCursor,
  InvalidCursorError,
  limitSchema,
  pageSchema,
} from './pagination';

describe('pagination', () => {
  describe('encodeCursor and decodeCursor round-trip', () => {
    it('should round-trip with a Date', () => {
      const date = new Date('2025-09-28T10:30:45.123Z');
      const original = { createdAt: date, id: '550e8400-e29b-41d4-a716-446655440000' };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      // createdAt should be returned as ISO string with milliseconds
      expect(decoded.createdAt).toBe(date.toISOString());
      expect(decoded.id).toBe(original.id);
    });

    it('should round-trip with an ISO string', () => {
      const isoString = '2025-09-28T10:30:45.123Z';
      const original = { createdAt: isoString, id: '550e8400-e29b-41d4-a716-446655440001' };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      expect(decoded.createdAt).toBe(isoString);
      expect(decoded.id).toBe(original.id);
    });
  });

  describe('decodeCursor errors', () => {
    it('should throw InvalidCursorError for "garbage!!"', () => {
      expect(() => decodeCursor('garbage!!')).toThrow(InvalidCursorError);
    });

    it('should throw InvalidCursorError for base64url of "not json"', () => {
      const invalidJson = Buffer.from('not json').toString('base64url');
      expect(() => decodeCursor(invalidJson)).toThrow(InvalidCursorError);
    });

    it('should throw InvalidCursorError for JSON with wrong shape', () => {
      const wrongShape = Buffer.from(JSON.stringify({ c: 'x', i: 'y' })).toString('base64url');
      expect(() => decodeCursor(wrongShape)).toThrow(InvalidCursorError);
    });

    it('should throw InvalidCursorError for non-UUID id', () => {
      const invalidUuid = Buffer.from(
        JSON.stringify({ c: '2025-09-28T10:30:45.123Z', i: 'not-a-uuid' }),
      ).toString('base64url');
      expect(() => decodeCursor(invalidUuid)).toThrow(InvalidCursorError);
    });

    it('should throw or return different value for tampered cursor', () => {
      const original = {
        createdAt: new Date('2025-09-28T10:30:45.123Z'),
        id: '550e8400-e29b-41d4-a716-446655440002',
      };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      // Flip the last character
      const tampered = encoded.slice(0, -1) + (encoded[encoded.length - 1] === 'A' ? 'B' : 'A');

      try {
        const tamperedDecoded = decodeCursor(tampered);
        // If decoding succeeds, the result should be different
        expect(tamperedDecoded).not.toEqual(decoded);
      } catch (err) {
        // If it throws, it should be InvalidCursorError
        expect(err).toBeInstanceOf(InvalidCursorError);
      }
    });
  });

  describe('limitSchema', () => {
    it('should default to 20 when undefined', () => {
      const result = limitSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(20);
      }
    });

    it('should coerce "10" to 10', () => {
      const result = limitSchema.safeParse('10');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('should accept 50', () => {
      const result = limitSchema.safeParse(50);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(50);
      }
    });

    it('should reject 51', () => {
      const result = limitSchema.safeParse(51);
      expect(result.success).toBe(false);
    });

    it('should reject 0', () => {
      const result = limitSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('should reject "abc"', () => {
      const result = limitSchema.safeParse('abc');
      expect(result.success).toBe(false);
    });
  });

  describe('pageSchema', () => {
    it('should parse {data: ["a"], nextCursor: null}', () => {
      const schema = pageSchema(z.string());
      const result = schema.safeParse({ data: ['a'], nextCursor: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ data: ['a'], nextCursor: null });
      }
    });
  });
});
