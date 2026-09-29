import { describe, it, expect } from 'vitest';
import { setupApiTest, seedId } from './helpers';
import type { ItemPage } from '@pb/shared';

describe('items pagination and filters', () => {
  const ctx = setupApiTest();

  describe('keyset pagination (dev-personal)', () => {
    const deckId = seedId('deck/dev-personal');

    it('creates 25 text items sequentially', async () => {
      for (let i = 1; i <= 25; i++) {
        const title = `Item ${String(i).padStart(2, '0')}`;
        const response = await ctx.app.request(`/decks/${deckId}/items`, {
          method: 'POST',
          headers: ctx.as(),
          body: JSON.stringify({
            type: 'text',
            title,
            body: `Body for ${title}`,
            payload: {},
          }),
        });
        expect(response.status).toBe(201);
      }
    });

    it('fetches all pages with limit=10 via nextCursor', async () => {
      const pages: any[][] = [];
      let cursor: string | null = null;
      const expectedSizes = [10, 10, 5];

      for (let page = 0; page < 3; page++) {
        let path = `/decks/${deckId}/items?limit=10`;
        if (cursor) {
          path += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const response = await ctx.app.request(path, {
          headers: ctx.as(),
        });
        expect(response.status).toBe(200);

        const data = (await response.json()) as ItemPage;
        pages.push(data.data);
        cursor = data.nextCursor;

        expect(data.data).toHaveLength(expectedSizes[page]);
        if (page < 2) {
          expect(cursor).not.toBeNull();
        } else {
          expect(cursor).toBeNull();
        }
      }

      // Collect all items
      const allItems = pages.flat();
      expect(allItems).toHaveLength(25);

      // Check all ids unique
      const ids = allItems.map((i) => i.id);
      expect(new Set(ids).size).toBe(25);

      // Check ordering: createdAt desc, then id desc
      for (let i = 0; i < allItems.length - 1; i++) {
        const curr = new Date(allItems[i].createdAt);
        const next = new Date(allItems[i + 1].createdAt);
        if (curr.getTime() === next.getTime()) {
          expect(allItems[i].id).toBeGreaterThan(allItems[i + 1].id);
        } else {
          expect(curr.getTime()).toBeGreaterThan(next.getTime());
        }
      }
    });

    it('maintains stability when new item added mid-pagination', async () => {
      // Fetch page 1
      const resp1 = await ctx.app.request(`/decks/${deckId}/items?limit=10`, {
        headers: ctx.as(),
      });
      expect(resp1.status).toBe(200);

      const page1 = (await resp1.json()) as ItemPage;
      const page1Items = page1.data;
      const cursor2 = page1.nextCursor;

      expect(page1Items).toHaveLength(10);
      expect(cursor2).not.toBeNull();

      // POST a new item
      const newItemResponse = await ctx.app.request(`/decks/${deckId}/items`, {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({
          type: 'text',
          title: 'New Item After Page 1',
          body: 'This should not appear in pages 2-3',
          payload: {},
        }),
      });
      expect(newItemResponse.status).toBe(201);

      // Fetch pages 2 and 3 with the saved cursor
      const remainingItems: any[] = [];
      let currentCursor = cursor2;

      for (let page = 0; page < 2; page++) {
        const path = `/decks/${deckId}/items?limit=10&cursor=${encodeURIComponent(currentCursor!)}`;

        const response = await ctx.app.request(path, {
          headers: ctx.as(),
        });
        expect(response.status).toBe(200);

        const data = (await response.json()) as ItemPage;
        remainingItems.push(...data.data);
        currentCursor = data.nextCursor;
      }

      expect(remainingItems).toHaveLength(15);

      // Check no duplicates and no gaps
      const page1Ids = new Set(page1Items.map((i) => i.id));
      const remainingIds = remainingItems.map((i) => i.id);
      for (const id of remainingIds) {
        expect(page1Ids.has(id)).toBe(false);
      }

      // Check new item not included
      const newItemTitle = 'New Item After Page 1';
      expect(
        page1Items.some((i) => i.title === newItemTitle) ||
          remainingItems.some((i) => i.title === newItemTitle),
      ).toBe(false);
    });
  });

  describe('filters (family)', () => {
    const familyDeckId = seedId('deck/family');

    it('filters by type=table → 2 items', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?type=table`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(200);

      const data = (await response.json()) as ItemPage;
      expect(data.data).toHaveLength(2);
      for (const item of data.data) {
        expect(item.type).toBe('table');
      }
    });

    it('filters by category=food with limit=50 → 12 items', async () => {
      const response = await ctx.app.request(
        `/decks/${familyDeckId}/items?category=food&limit=50`,
        {
          headers: ctx.as(),
        },
      );
      expect(response.status).toBe(200);

      const data = (await response.json()) as ItemPage;
      expect(data.data).toHaveLength(12);
    });

    it('filters by status=archived → 2 items', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?status=archived`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(200);

      const data = (await response.json()) as ItemPage;
      expect(data.data).toHaveLength(2);
      for (const item of data.data) {
        expect(item.status).toBe('archived');
      }
    });

    it('default status filter → 23 items', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?limit=50`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(200);

      const data = (await response.json()) as ItemPage;
      expect(data.data).toHaveLength(23);
      for (const item of data.data) {
        expect(item.status).toBe('published');
      }
    });

    it('invalid category slug → 404', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?category=nope`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.type).toBe('/problems/not-found');
    });

    it('limit > 50 → 400', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?limit=51`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.type).toBe('/problems/validation');
    });

    it('limit = 0 → 400', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?limit=0`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.type).toBe('/problems/validation');
    });

    it('invalid cursor → 400 with /problems/invalid-cursor', async () => {
      const response = await ctx.app.request(`/decks/${familyDeckId}/items?cursor=garbage`, {
        headers: ctx.as(),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.type).toBe('/problems/invalid-cursor');
    });

    it('soft-deleted item not in default list', async () => {
      // Get first item
      const resp1 = await ctx.app.request(`/decks/${familyDeckId}/items?limit=50`, {
        headers: ctx.as(),
      });
      expect(resp1.status).toBe(200);

      const data1 = (await resp1.json()) as ItemPage;
      const itemToDelete = data1.data[0];

      // Delete it
      const deleteResponse = await ctx.app.request(`/items/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: ctx.as(),
      });
      expect(deleteResponse.status).toBe(204);

      // Fetch list again
      const resp2 = await ctx.app.request(`/decks/${familyDeckId}/items?limit=50`, {
        headers: ctx.as(),
      });
      expect(resp2.status).toBe(200);

      const data2 = (await resp2.json()) as ItemPage;
      expect(data2.data).toHaveLength(22);

      const deletedIds = new Set(data2.data.map((i) => i.id));
      expect(deletedIds.has(itemToDelete.id)).toBe(false);
    });
  });
});
