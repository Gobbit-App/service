import { describe, it, expect } from 'vitest';
import { deckListSchema, deckWithCategoriesSchema, deckSchema, problemSchema } from '@pb/shared';
import { setupApiTest, fixtureId } from './helpers';

const ctx = setupApiTest();

describe('decks', () => {
  describe('POST /decks', () => {
    it('creates a deck with derived slug', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Road Trip' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      const pb = deckWithCategoriesSchema.parse(body);
      expect(pb.slug).toBe('road-trip');
      expect(pb.kind).toBe('personal');
      expect(pb.categories).toHaveLength(1);
      const general = pb.categories[0];
      expect(general.slug).toBe('general');
      expect(general.isDefault).toBe(true);
    });

    it('rejects duplicate slug', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Family' }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      problemSchema.parse(body);
    });

    it('rejects extra fields', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'x', extra: 1 }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      const problem = problemSchema.parse(body);
      expect(problem.errors).toBeDefined();
      expect(Array.isArray(problem.errors)).toBe(true);
    });

    it('handles names that cannot be slugified', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'שלום' }),
      });
      // Per brief: accept status 400 or 201; if 201 slug must match slug regex
      if (res.status === 201) {
        const body = await res.json();
        const pb = deckWithCategoriesSchema.parse(body);
        // slug regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        expect(pb.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      } else if (res.status === 400) {
        const body = await res.json();
        problemSchema.parse(body);
      } else {
        throw new Error(`unexpected status ${res.status}`);
      }
    });
  });

  describe('GET /decks', () => {
    it('lists decks owned by user', async () => {
      const res = await ctx.app.request('/decks', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      const list = deckListSchema.parse(body);
      const slugs = list.data.map((pb) => pb.slug);
      expect(slugs).toContain('personal');
      expect(slugs).toContain('family');
      expect(slugs).toContain('scratch');
      expect(slugs).not.toContain('other-personal');
    });
  });

  describe('GET /decks/{id}', () => {
    it('gets deck by slug and by id return same data', async () => {
      const familyId = fixtureId('deck/family');

      const bySlugRes = await ctx.app.request('/decks/family', {
        headers: ctx.as(),
      });
      expect(bySlugRes.status).toBe(200);
      const bySlugBody = await bySlugRes.json();
      const bySlugPb = deckSchema.parse(bySlugBody);

      const byIdRes = await ctx.app.request(`/decks/${familyId}`, {
        headers: ctx.as(),
      });
      expect(byIdRes.status).toBe(200);
      const byIdBody = await byIdRes.json();
      const byIdPb = deckSchema.parse(byIdBody);

      expect(bySlugPb.id).toBe(byIdPb.id);
      expect(bySlugPb).toEqual(byIdPb);
    });

    it('returns 404 for nonexistent deck', async () => {
      const res = await ctx.app.request('/decks/does-not-exist', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });

  describe('PATCH /decks/{id}', () => {
    it('updates deck', async () => {
      // First create one to update
      const createRes = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Patch Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const pbId = created.id;
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const patchRes = await ctx.app.request(`/decks/${pbId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({
          name: 'Road Trip 2026',
          isPublic: true,
        }),
      });
      expect(patchRes.status).toBe(200);
      const body = await patchRes.json();
      const pb = deckSchema.parse(body);
      expect(pb.name).toBe('Road Trip 2026');
      expect(pb.isPublic).toBe(true);
      expect(pb.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('rejects empty patch', async () => {
      const familyId = fixtureId('deck/family');
      const res = await ctx.app.request(`/decks/${familyId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });

  describe('DELETE /decks/:id', () => {
    it('soft-deletes the deck, then 404s and frees the slug', async () => {
      const create = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Throwaway', slug: 'throwaway', kind: 'shared' }),
      });
      expect(create.status).toBe(201);
      const { id } = await create.json();

      const del = await ctx.app.request(`/decks/${id}`, { method: 'DELETE', headers: ctx.as() });
      expect(del.status).toBe(204);

      expect((await ctx.app.request(`/decks/${id}`, { headers: ctx.as() })).status).toBe(404);
      expect((await ctx.app.request('/decks/throwaway', { headers: ctx.as() })).status).toBe(404);
      const again = await ctx.app.request(`/decks/${id}`, { method: 'DELETE', headers: ctx.as() });
      expect(again.status).toBe(404);

      const list = await (await ctx.app.request('/decks', { headers: ctx.as() })).json();
      expect(list.data.map((d: { id: string }) => d.id)).not.toContain(id);

      const reuse = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Throwaway', slug: 'throwaway', kind: 'shared' }),
      });
      expect(reuse.status).toBe(201);
      expect((await reuse.json()).id).not.toBe(id);
    });

    it("404s on another user's deck", async () => {
      const res = await ctx.app.request('/decks/other-personal', {
        method: 'DELETE',
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
    });
  });
});
