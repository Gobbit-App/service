import { describe, it, expect } from 'vitest';
import { itemCreateSchema } from '@pb/shared';
import { seedCards } from './cards';
import { buildSeedData, seedId, FAMILY_CATEGORIES } from './data';

describe('Seed Data', () => {
  describe('seedCards validation', () => {
    it('should have exactly 25 cards', () => {
      expect(seedCards).toHaveLength(25);
    });

    it('should have unique keys', () => {
      const keys = seedCards.map((c) => c.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it.each(seedCards)('card "$key" should parse with itemCreateSchema', ({ key, card }) => {
      const result = itemCreateSchema.safeParse(card);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error(`Parse errors for ${key}:`, result.error.issues);
      }
    });

    it('archived cards: exactly 2, none tagged with food', () => {
      const archived = seedCards.filter((c) => c.status === 'archived');
      expect(archived).toHaveLength(2);
      for (const card of archived) {
        expect(card.categories).not.toContain('food');
      }
    });

    it('food-tagged cards: exactly 12, all published', () => {
      const foodCards = seedCards.filter((c) => c.categories.includes('food'));
      expect(foodCards).toHaveLength(12);
      for (const card of foodCards) {
        expect(card.status).toBe('published');
      }
    });

    it('should have exactly 2 table-type items', () => {
      const tables = seedCards.filter((c) => c.card.type === 'table');
      expect(tables).toHaveLength(2);
    });

    it('should have exactly 1 calc-type item', () => {
      const calcs = seedCards.filter((c) => c.card.type === 'calc');
      expect(calcs).toHaveLength(1);
    });

    it('should have at least 1 link-type item', () => {
      const links = seedCards.filter((c) => c.card.type === 'link');
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it('should have at least 1 image-type item', () => {
      const images = seedCards.filter((c) => c.card.type === 'image');
      expect(images.length).toBeGreaterThanOrEqual(1);
    });

    it('should have exactly 1 favorited card', () => {
      const favorited = seedCards.filter((c) => c.favorite === true);
      expect(favorited).toHaveLength(1);
    });

    it('should have at least 3 cards each in Hebrew, Greek, and English', () => {
      const heCards = seedCards.filter((c) => c.lang === 'he');
      const elCards = seedCards.filter((c) => c.lang === 'el');
      const enCards = seedCards.filter((c) => c.lang === 'en');
      expect(heCards.length).toBeGreaterThanOrEqual(3);
      expect(elCards.length).toBeGreaterThanOrEqual(3);
      expect(enCards.length).toBeGreaterThanOrEqual(3);
    });

    it('all card categories should be in FAMILY_CATEGORIES slugs', () => {
      const familyCategorySlugs = new Set(FAMILY_CATEGORIES.map((c) => c.slug));
      for (const card of seedCards) {
        for (const categorySlug of card.categories) {
          expect((familyCategorySlugs as Set<string>).has(categorySlug)).toBe(true);
        }
      }
    });

    it('seedId should be deterministic', () => {
      const id1 = seedId('test-key');
      const id2 = seedId('test-key');
      expect(id1).toBe(id2);
    });

    it('seedId should generate valid UUID v5', () => {
      const id = seedId('test-key');
      // UUID v5: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
      const uuidV5Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidV5Regex);
    });

    it('seedId should generate unique IDs across all card keys', () => {
      const ids = seedCards.map((c) => seedId(c.key));
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(seedCards.length);
    });
  });

  describe('buildSeedData', () => {
    it('should lowercase email and yield correct pocketbook slugs', () => {
      const seedData = buildSeedData('DEV@Example.test');
      const slugs = seedData.pocketbooks.map((p) => p.slug);
      expect(slugs).toEqual(['dev-personal', 'family', 'smoke', 'other-personal']);

      const devUser = seedData.users.find((u) => u.email === 'dev@example.test');
      expect(devUser).toBeDefined();
    });

    it('should have exactly 4 pocketbooks', () => {
      const seedData = buildSeedData('dev@example.test');
      expect(seedData.pocketbooks).toHaveLength(4);
    });

    it('should have exactly 2 accounts', () => {
      const seedData = buildSeedData('dev@example.test');
      expect(seedData.accounts).toHaveLength(2);
    });

    it('should have exactly 2 users', () => {
      const seedData = buildSeedData('dev@example.test');
      expect(seedData.users).toHaveLength(2);
    });

    it('should have categories only for family pocketbook', () => {
      const seedData = buildSeedData('dev@example.test');
      const familyPocketbookId = seedData.pocketbooks.find((p) => p.slug === 'family')?.id;
      expect(familyPocketbookId).toBeDefined();
      for (const category of seedData.categories) {
        expect(category.pocketbookId).toBe(familyPocketbookId);
      }
    });
  });
});
