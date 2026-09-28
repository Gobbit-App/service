import { describe, it, expect } from 'vitest';
import { mapPgError, findPgError } from './pg-error-map';

describe('pg-error-map', () => {
  describe('mapPgError', () => {
    it('maps P0001 with default_category_protected to 409', () => {
      const err = Object.assign(new Error('default_category_protected'), {
        code: 'P0001',
        message: 'default_category_protected',
      });

      const result = mapPgError(err);

      expect(result).toMatchObject({
        status: 409,
        type: '/problems/default-category-protected',
        title: 'Default category is protected',
      });
    });

    it('maps 23505 to 409 conflict', () => {
      const err = Object.assign(new Error('duplicate key'), {
        code: '23505',
        message: 'duplicate key',
      });

      const result = mapPgError(err);

      expect(result).toMatchObject({
        status: 409,
        type: '/problems/conflict',
        title: 'Conflict',
        detail: 'Resource already exists',
      });
    });

    it('maps 23514 to 422 constraint-violation', () => {
      const err = Object.assign(new Error('check violation'), {
        code: '23514',
        message: 'check violation',
      });

      const result = mapPgError(err);

      expect(result).toMatchObject({
        status: 422,
        type: '/problems/constraint-violation',
        title: 'Constraint violation',
      });
    });

    it('maps 23503 to 422 invalid-reference', () => {
      const err = Object.assign(new Error('foreign key violation'), {
        code: '23503',
        message: 'foreign key violation',
      });

      const result = mapPgError(err);

      expect(result).toMatchObject({
        status: 422,
        type: '/problems/invalid-reference',
        title: 'Invalid reference',
      });
    });

    it('returns null for unknown pg code', () => {
      const err = Object.assign(new Error('syntax error'), {
        code: '42601',
        message: 'syntax error',
      });

      expect(mapPgError(err)).toBeNull();
    });

    it('returns null for plain Error', () => {
      expect(mapPgError(new Error('plain error'))).toBeNull();
    });

    it('extracts from wrapped errors with cause chain', () => {
      const err = Object.assign(new Error('Failed query: select ...'), {
        cause: {
          code: '23505',
          message: 'dup',
          constraint: 'pocketbooks_slug_active_uq',
        },
      });

      const result = mapPgError(err);

      expect(result?.status).toBe(409);
      expect(result?.type).toBe('/problems/conflict');
      expect(JSON.stringify(result)).not.toContain('select');
    });

    it('returns null for P0001 with other message', () => {
      const err = Object.assign(new Error('some other error'), {
        code: 'P0001',
        message: 'some other error',
      });

      expect(mapPgError(err)).toBeNull();
    });
  });

  describe('findPgError', () => {
    it('finds error in direct properties', () => {
      const err = Object.assign(new Error('test'), {
        code: '23505',
        message: 'dup key',
        constraint: 'idx_name',
      });

      const result = findPgError(err);

      expect(result).toEqual({
        code: '23505',
        message: 'dup key',
        constraint: 'idx_name',
      });
    });

    it('finds error in cause chain', () => {
      const err = Object.assign(new Error('wrapper'), {
        cause: {
          code: '23505',
          message: 'dup key',
          constraint: 'idx_name',
        },
      });

      const result = findPgError(err);

      expect(result).toEqual({
        code: '23505',
        message: 'dup key',
        constraint: 'idx_name',
      });
    });

    it('returns null when no error found', () => {
      expect(findPgError(new Error('plain error'))).toBeNull();
    });
  });
});
