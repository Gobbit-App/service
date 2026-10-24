import { describe, it, expect } from 'vitest';
import { publicDeckSchema, publicItemListQuerySchema } from './public';
import { PUBLIC_PAGE_LIMIT_MAX } from '../limits';

describe('publicItemListQuerySchema (D174)', () => {
  it('defaults the limit to 20', () => {
    expect(publicItemListQuerySchema.parse({}).limit).toBe(20);
  });

  it('accepts limits 1..max and rejects outside', () => {
    expect(publicItemListQuerySchema.safeParse({ limit: '1' }).success).toBe(true);
    expect(
      publicItemListQuerySchema.safeParse({ limit: String(PUBLIC_PAGE_LIMIT_MAX) }).success,
    ).toBe(true);
    expect(publicItemListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      publicItemListQuerySchema.safeParse({ limit: String(PUBLIC_PAGE_LIMIT_MAX + 1) }).success,
    ).toBe(false);
  });

  it('rejects a malformed category slug', () => {
    expect(publicItemListQuerySchema.safeParse({ category: 'Not A Slug' }).success).toBe(false);
  });
});

describe('publicDeckSchema (D174)', () => {
  it('refuses the personal kind', () => {
    const deck = { slug: 's', name: 'S', kind: 'personal', categories: [] };
    expect(publicDeckSchema.safeParse(deck).success).toBe(false);
    expect(publicDeckSchema.safeParse({ ...deck, kind: 'communal' }).success).toBe(true);
  });
});
