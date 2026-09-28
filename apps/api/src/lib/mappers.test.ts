import { describe, it, expect } from 'vitest';
import { toPocketbookDto, toCategoryDto, toItemDto } from './mappers';
import { pocketbookSchema, categorySchema, itemSchema } from '@pb/shared';
import type { PocketbookRow, CategoryRow, ItemRow } from '@pb/db';

describe('mappers', () => {
  describe('toPocketbookDto', () => {
    it('should map PocketbookRow to Pocketbook DTO and parse with schema', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const row: PocketbookRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'personal',
        slug: 'test-pocketbook',
        name: 'Test Pocketbook',
        ownerAccountId: '223e4567-e89b-12d3-a456-426614174000',
        isPublic: false,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      };

      const dto = toPocketbookDto(row);

      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(Object.keys(dto)).not.toContain('deletedAt');

      const parsed = pocketbookSchema.parse(dto);
      expect(parsed).toBeDefined();
    });
  });

  describe('toCategoryDto', () => {
    it('should map CategoryRow to Category DTO and parse with schema', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const row: CategoryRow = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        pocketbookId: '123e4567-e89b-12d3-a456-426614174000',
        slug: 'test-category',
        name: 'Test Category',
        visibility: 'shared',
        isDefault: false,
        position: 1,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      };

      const dto = toCategoryDto(row);

      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(Object.keys(dto)).not.toContain('deletedAt');

      const parsed = categorySchema.parse(dto);
      expect(parsed).toBeDefined();
    });
  });

  describe('toItemDto', () => {
    it('should map ItemRow to Item DTO with categoryIds and isFavorite and parse with schema', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const row: ItemRow = {
        id: '423e4567-e89b-12d3-a456-426614174000',
        pocketbookId: '123e4567-e89b-12d3-a456-426614174000',
        type: 'text',
        status: 'published',
        title: 'Test Item',
        body: 'Test body',
        payload: {},
        sourceUrl: null,
        sourceKind: 'manual',
        verifiedAt: null,
        createdBy: '523e4567-e89b-12d3-a456-426614174000',
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      };

      const dto = toItemDto(row, ['c1'], true);

      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.verifiedAt).toBeNull();
      expect(dto.categoryIds).toEqual(['c1']);
      expect(dto.isFavorite).toBe(true);
      expect(Object.keys(dto)).not.toContain('deletedAt');

      const parsed = itemSchema.parse(dto);
      expect(parsed).toBeDefined();
    });
  });
});
