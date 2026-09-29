import { describe, it, expect } from 'vitest';
import { setupApiTest, OWNER_EMAIL, OTHER_EMAIL, fixtureId } from './helpers';

describe('access control', () => {
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
      const itemId = fixtureId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('PATCH /items/{family item} returns 404', async () => {
      const itemId = fixtureId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        method: 'PATCH',
        headers: ctx.as(OTHER_EMAIL),
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });

    it('DELETE /items/{family item} returns 404', async () => {
      const itemId = fixtureId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        method: 'DELETE',
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });

    it('POST /items/{family item}/favorite returns 404', async () => {
      const itemId = fixtureId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}/favorite`, {
        method: 'POST',
        headers: ctx.as(OTHER_EMAIL),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('owner still sees family deck', () => {
    it('GET /decks/family returns 200', async () => {
      const res = await ctx.app.request('/decks/family', {
        headers: ctx.as(OWNER_EMAIL),
      });
      expect(res.status).toBe(200);
    });

    it('GET /items/{family item} returns 200', async () => {
      const itemId = fixtureId('family/food/souvlaki-place');
      const res = await ctx.app.request(`/items/${itemId}`, {
        headers: ctx.as(OWNER_EMAIL),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('credential failures', () => {
    it('no credentials on a protected route returns 401', async () => {
      const res = await ctx.app.request('/decks', { headers: ctx.anon() });
      expect(res.status).toBe(401);
    });

    it('unknown bearer token returns 401 problem+json', async () => {
      const res = await ctx.app.request('/decks', {
        headers: { Authorization: 'Bearer ' + 'y'.repeat(43), 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    });

    it('non-bearer Authorization scheme returns 401', async () => {
      const res = await ctx.app.request('/decks', {
        headers: { Authorization: 'Basic abc', 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });
  });
});
