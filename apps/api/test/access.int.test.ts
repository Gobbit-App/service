import { describe, it, expect } from 'vitest';
import { setupApiTest, DEFAULT_DEV_EMAIL, OTHER_EMAIL, seedId } from './helpers';

describe('access control and dev auth', () => {
  const ctx = setupApiTest();

  describe('other user (owner of other-personal only)', () => {
    it('GET /decks returns only other-personal', async () => {
      const res = await ctx.app.request('/decks', {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].slug).toBe('other-personal');
    });

    it('GET /decks/family returns 404', async () => {
      const res = await ctx.app.request('/decks/family', {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('GET /decks/family/items returns 404', async () => {
      const res = await ctx.app.request('/decks/family/items', {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('GET /decks/family/categories returns 404', async () => {
      const res = await ctx.app.request('/decks/family/categories', {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('POST /decks/family/items returns 404', async () => {
      const res = await ctx.app.request('/decks/family/items', {
        method: 'POST',
        headers: ctx.as(OTHER_EMAIL),
        body: JSON.stringify({
          type: 'text',
          title: 'Test',
          payload: {},
        }),
      });
      expect(res.status).toBe(404);
    });

    it('GET /items/{family item} returns 404', async () => {
      const itemId = seedId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('PATCH /items/{family item} returns 404', async () => {
      const itemId = seedId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        method: 'PATCH',
        headers: ctx.as(OTHER_EMAIL),
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });

    it('DELETE /items/{family item} returns 404', async () => {
      const itemId = seedId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        method: 'DELETE',
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('POST /items/{family item}/favorite returns 404', async () => {
      const itemId = seedId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'POST',
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('dev user still sees family deck', () => {
    it('GET /decks/family returns 200', async () => {
      const res = await ctx.app.request('/decks/family', {
        headers: ctx.as(DEFAULT_DEV_EMAIL),
      });
      expect(res.status).toBe(200);
    });

    it('GET /items/{family item} returns 200', async () => {
      const itemId = seedId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(DEFAULT_DEV_EMAIL),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('dev auth failures', () => {
    it('unknown X-Dev-User returns 401', async () => {
      const res = await ctx.app.request('/decks', {
        headers: {
          Authorization: `Bearer ${'x'.repeat(40)}`,
          'X-Dev-User': 'nobody@example.test',
          'Content-Type': 'application/json',
        },
      });
      expect(res.status).toBe(401);
    });

    it('wrong bearer token returns 401', async () => {
      const res = await ctx.app.request('/decks', {
        headers: {
          Authorization: 'Bearer ' + 'y'.repeat(40),
          'X-Dev-User': DEFAULT_DEV_EMAIL,
          'Content-Type': 'application/json',
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
