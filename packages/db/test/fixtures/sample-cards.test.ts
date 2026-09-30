import { describe, it, expect } from 'vitest';
import { itemCreateSchema } from '@pb/shared';
import { SAMPLE_CATEGORIES, sampleCards } from './sample-cards';

describe('sample cards fixture', () => {
  it('has 25 cards with unique keys', () => {
    expect(sampleCards).toHaveLength(25);
    expect(new Set(sampleCards.map((c) => c.key)).size).toBe(25);
  });

  it.each(sampleCards)('card "$key" parses with itemCreateSchema', ({ card }) => {
    expect(itemCreateSchema.safeParse(card).success).toBe(true);
  });

  it('keeps the shape the pagination and filter suites rely on', () => {
    const archived = sampleCards.filter((c) => c.status === 'archived');
    expect(archived).toHaveLength(2);
    expect(archived.every((c) => !c.categories.includes('food'))).toBe(true);
    const food = sampleCards.filter((c) => c.categories.includes('food'));
    expect(food).toHaveLength(12);
    expect(food.every((c) => c.status === 'published')).toBe(true);
    expect(sampleCards.filter((c) => c.card.type === 'table')).toHaveLength(2);
    expect(sampleCards.filter((c) => c.card.type === 'calc')).toHaveLength(1);
    expect(sampleCards.filter((c) => c.favorite)).toHaveLength(1);
    expect(sampleCards.some((c) => c.categories.includes('admin'))).toBe(true);
  });

  it('covers Hebrew, Greek and English', () => {
    for (const lang of ['he', 'el', 'en'] as const) {
      expect(sampleCards.filter((c) => c.lang === lang).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('only uses declared category slugs', () => {
    const slugs = new Set<string>(SAMPLE_CATEGORIES.map((c) => c.slug));
    for (const card of sampleCards) {
      for (const slug of card.categories) expect(slugs.has(slug)).toBe(true);
    }
  });
});
