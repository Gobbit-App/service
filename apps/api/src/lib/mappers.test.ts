import { describe, it, expect } from 'vitest';
import { toDeckDto, toCategoryDto, toItemDto } from './mappers';
import { deckSchema, categorySchema, itemSchema } from '@gobbit/shared';
import type { DeckRow, CategoryRow, ItemRow } from '@gobbit/db';

describe('mappers', () => {
  describe('toDeckDto', () => {
    it('should map DeckRow to Deck DTO and parse with schema', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const row: DeckRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'personal',
        slug: 'test-deck',
        name: 'Test Deck',
        ownerAccountId: '223e4567-e89b-12d3-a456-426614174000',
        isPublic: false,
        isDefault: false,
        autoPublishShares: false,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      };

      const dto = toDeckDto(row, 'owner');

      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(Object.keys(dto)).not.toContain('deletedAt');

      const parsed = deckSchema.parse(dto);
      expect(parsed).toBeDefined();
    });

    it('addresses the personal deck as "me" and flags it', () => {
      const row: DeckRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'personal',
        slug: 'personal-223e4567-e89b-12d3-a456-426614174000',
        name: 'My deck',
        ownerAccountId: '223e4567-e89b-12d3-a456-426614174000',
        isPublic: false,
        isDefault: true,
        autoPublishShares: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const dto = toDeckDto(row, 'owner');

      expect(dto.slug).toBe('me');
      expect(dto.isDefault).toBe(true);
      expect(dto.autoPublishShares).toBe(true);
      expect(deckSchema.parse(dto).slug).toBe('me');
    });

    it('keeps the stored slug for non-default decks', () => {
      const row: DeckRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        kind: 'shared',
        slug: 'family',
        name: 'Family',
        ownerAccountId: '223e4567-e89b-12d3-a456-426614174000',
        isPublic: false,
        isDefault: false,
        autoPublishShares: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      expect(toDeckDto(row, 'owner')).toMatchObject({ slug: 'family', isDefault: false });
    });
  });

  describe('toCategoryDto', () => {
    it('should map CategoryRow to Category DTO and parse with schema', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const row: CategoryRow = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        deckId: '123e4567-e89b-12d3-a456-426614174000',
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
        deckId: '123e4567-e89b-12d3-a456-426614174000',
        type: 'text',
        status: 'published',
        title: 'Test Item',
        body: 'Test body',
        payload: {},
        entities: { phones: ['+972-3-555-0100'] },
        sourceUrl: null,
        sourceKind: 'manual',
        verifiedAt: null,
        createdBy: '523e4567-e89b-12d3-a456-426614174000',
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
        searchText: 'test item test body',
        embeddingModel: null,
        embeddedHash: null,
        embeddedAt: null,
        revealAt: null,
        cover: null,
      };

      const dto = toItemDto(row, ['c1'], true);

      expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(dto.verifiedAt).toBeNull();
      expect(dto.categoryIds).toEqual(['c1']);
      expect(dto.isFavorite).toBe(true);
      expect(dto.entities).toEqual({ phones: ['+972-3-555-0100'] });
      expect(Object.keys(dto)).not.toContain('deletedAt');

      const parsed = itemSchema.parse(dto);
      expect(parsed).toBeDefined();
    });

    describe('cover (044)', () => {
      const base = (cover: ItemRow['cover']): ItemRow => ({
        id: '423e4567-e89b-12d3-a456-426614174000',
        deckId: '123e4567-e89b-12d3-a456-426614174000',
        type: 'text',
        status: 'published',
        title: 'T',
        body: 'B',
        payload: {},
        entities: {},
        sourceUrl: null,
        sourceKind: 'manual',
        verifiedAt: null,
        createdBy: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        searchText: 't b',
        embeddingModel: null,
        embeddedHash: null,
        embeddedAt: null,
        revealAt: null,
        cover,
      });

      it('returns cover null when unset', () => {
        expect(toItemDto(base(null), [], false).cover).toBeNull();
      });

      it('passes a cover with dimensions through', () => {
        const dto = toItemDto(
          base({ publicId: 'gobbit/items/d/a', width: 800, height: 600 }),
          [],
          false,
        );
        expect(dto.cover).toEqual({ publicId: 'gobbit/items/d/a', width: 800, height: 600 });
        expect(itemSchema.safeParse(dto).success).toBe(true);
      });

      it('omits width and height when the stored cover lacks them', () => {
        const dto = toItemDto(base({ publicId: 'gobbit/items/d/a' }), [], false);
        expect(Object.keys(dto.cover ?? {})).toEqual(['publicId']);
      });
    });
  });
});
