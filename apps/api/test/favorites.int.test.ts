import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { setupApiTest, fixtureId } from './helpers';
import { favorites } from '@pb/db';

describe('favorites', () => {
  const ctx = setupApiTest();

  describe('seeded data', () => {
    it('should have exactly one favorited item initially (the souvlaki link)', async () => {
      const itemsResp = await ctx.app.request('/decks/family/items?limit=50', {
        headers: ctx.as(),
      });
      expect(itemsResp.status).toBe(200);
      const itemsPage = await itemsResp.json();
      const favoritedItems = itemsPage.data.filter((item: any) => item.isFavorite);
      expect(favoritedItems).toHaveLength(1);
      expect(favoritedItems[0].id).toBe(fixtureId('family/food/souvlaki-place'));
    });
  });

  describe('POST /items/{id}/favorite', () => {
    it('should add favorite and be idempotent (D15)', async () => {
      // Get family deck items, find first one without favorite
      const itemsResp = await ctx.app.request('/decks/family/items?limit=50', {
        headers: ctx.as(),
      });
      expect(itemsResp.status).toBe(200);
      const itemsPage = await itemsResp.json();
      const targetItem = itemsPage.data.find((item: any) => !item.isFavorite);
      expect(targetItem).toBeDefined();
      const itemId = targetItem.id;

      // First POST → 204
      let res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect(res.status).toBe(204);

      // Second POST → 204 (idempotent)
      res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect(res.status).toBe(204);

      // SQL: count favorites rows for (dev user, item) = 1
      const ownerUserId = fixtureId('user/owner');
      const favRows = await ctx.t.db
        .select()
        .from(favorites)
        .where(and(eq(favorites.userId, ownerUserId), eq(favorites.itemId, itemId)));
      expect(favRows).toHaveLength(1);

      // GET /items/:id → isFavorite true
      const getResp = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(),
      });
      expect(getResp.status).toBe(200);
      const item = await getResp.json();
      expect(item.isFavorite).toBe(true);
    });

    it('should return 404 for non-existent item', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const res = await ctx.app.request(`/items/${fakeId}/favorite`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('cross-user favorites', () => {
    it('should not show other users favorite to current user', async () => {
      // Get a non-favorited item
      const itemsResp = await ctx.app.request('/decks/family/items?limit=50', {
        headers: ctx.as(),
      });
      expect(itemsResp.status).toBe(200);
      const itemsPage = await itemsResp.json();
      const targetItem = itemsPage.data.find((item: any) => !item.isFavorite);
      const itemId = targetItem.id;

      // Insert favorite via SQL for other user
      const otherUserId = fixtureId('user/other');
      await ctx.t.db.insert(favorites).values({
        userId: otherUserId,
        itemId: itemId,
      });

      // Dev user GET /items/:id → isFavorite false
      const getResp = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(),
      });
      expect(getResp.status).toBe(200);
      const item = await getResp.json();
      expect(item.isFavorite).toBe(false);
    });
  });

  describe('DELETE /items/{id}/favorite', () => {
    it('should remove favorite and be idempotent', async () => {
      // Get family items, find first one with isFavorite true
      const itemsResp = await ctx.app.request('/decks/family/items?limit=50', {
        headers: ctx.as(),
      });
      expect(itemsResp.status).toBe(200);
      const itemsPage = await itemsResp.json();
      const targetItem = itemsPage.data.find((item: any) => item.isFavorite);
      expect(targetItem).toBeDefined();
      const itemId = targetItem.id;

      // First DELETE → 204
      let res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'DELETE',
        headers: ctx.as(),
      });
      expect(res.status).toBe(204);

      // Second DELETE → 204 (idempotent)
      res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'DELETE',
        headers: ctx.as(),
      });
      expect(res.status).toBe(204);

      // GET /items/:id → isFavorite false
      const getResp = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(),
      });
      expect(getResp.status).toBe(200);
      const item = await getResp.json();
      expect(item.isFavorite).toBe(false);
    });
  });
});
