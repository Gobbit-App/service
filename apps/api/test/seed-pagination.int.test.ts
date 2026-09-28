import { describe, it, expect } from 'vitest';
import { setupApiTest, DEFAULT_DEV_EMAIL, seedId } from './helpers';

describe('seed pagination', () => {
  const ctx = setupApiTest();

  it('should paginate food items correctly', async () => {
    const foodCategoryId = seedId('family/food');

    // First request: get 10 items with category=food
    const firstRes = await ctx.app.request('/pocketbooks/family/items?category=food&limit=10', {
      headers: ctx.as(DEFAULT_DEV_EMAIL),
    });

    expect(firstRes.status).toBe(200);
    const firstPage = await firstRes.json();

    // Verify 10 items returned
    expect(firstPage.data).toHaveLength(10);

    // Verify nextCursor is not null (indicates more items available)
    expect(firstPage.nextCursor).not.toBeNull();

    // Verify all items are published and have food category
    for (const item of firstPage.data) {
      expect(item.status).toBe('published');
      expect(item.categoryIds).toContain(foodCategoryId);
    }

    // Second request: get remaining items with cursor
    const secondRes = await ctx.app.request(
      `/pocketbooks/family/items?category=food&limit=10&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      {
        headers: ctx.as(DEFAULT_DEV_EMAIL),
      },
    );

    expect(secondRes.status).toBe(200);
    const secondPage = await secondRes.json();

    // Verify 2 items returned (12 total - 10 from first page)
    expect(secondPage.data).toHaveLength(2);

    // Verify nextCursor is null (no more items)
    expect(secondPage.nextCursor).toBeNull();

    // Verify all items are published and have food category
    for (const item of secondPage.data) {
      expect(item.status).toBe('published');
      expect(item.categoryIds).toContain(foodCategoryId);
    }
  });
});
