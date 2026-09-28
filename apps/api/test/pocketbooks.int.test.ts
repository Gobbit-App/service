import { describe, it, expect } from 'vitest';
import {
  pocketbookListSchema,
  pocketbookWithCategoriesSchema,
  pocketbookSchema,
  problemSchema,
} from '@pb/shared';
import { setupApiTest, seedId } from './helpers';

const ctx = setupApiTest();

describe('pocketbooks', () => {
  describe('POST /pocketbooks', () => {
    it('creates a pocketbook with derived slug @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Road Trip' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      const pb = pocketbookWithCategoriesSchema.parse(body);
      expect(pb.slug).toBe('road-trip');
      expect(pb.kind).toBe('personal');
      expect(pb.categories).toHaveLength(1);
      const general = pb.categories[0];
      expect(general.slug).toBe('general');
      expect(general.isDefault).toBe(true);
    });

    it('rejects duplicate slug @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Family' }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      problemSchema.parse(body);
    });

    it('rejects extra fields @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks', {
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

    it('handles names that cannot be slugified @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'שלום' }),
      });
      // Per brief: accept status 400 or 201; if 201 slug must match slug regex
      if (res.status === 201) {
        const body = await res.json();
        const pb = pocketbookWithCategoriesSchema.parse(body);
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

  describe('GET /pocketbooks', () => {
    it('lists pocketbooks owned by user @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      const list = pocketbookListSchema.parse(body);
      const slugs = list.data.map((pb) => pb.slug);
      expect(slugs).toContain('dev-personal');
      expect(slugs).toContain('family');
      expect(slugs).toContain('smoke');
      expect(slugs).not.toContain('other-personal');
    });
  });

  describe('GET /pocketbooks/{id}', () => {
    it('gets pocketbook by slug and by id return same data @smoke', async () => {
      const familyId = seedId('pocketbook/family');

      const bySlugRes = await ctx.app.request('/pocketbooks/family', {
        headers: ctx.as(),
      });
      expect(bySlugRes.status).toBe(200);
      const bySlugBody = await bySlugRes.json();
      const bySlugPb = pocketbookSchema.parse(bySlugBody);

      const byIdRes = await ctx.app.request(`/pocketbooks/${familyId}`, {
        headers: ctx.as(),
      });
      expect(byIdRes.status).toBe(200);
      const byIdBody = await byIdRes.json();
      const byIdPb = pocketbookSchema.parse(byIdBody);

      expect(bySlugPb.id).toBe(byIdPb.id);
      expect(bySlugPb).toEqual(byIdPb);
    });

    it('returns 404 for nonexistent pocketbook @smoke', async () => {
      const res = await ctx.app.request('/pocketbooks/does-not-exist', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });

  describe('PATCH /pocketbooks/{id}', () => {
    it('updates pocketbook @smoke', async () => {
      // First create one to update
      const createRes = await ctx.app.request('/pocketbooks', {
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

      const patchRes = await ctx.app.request(`/pocketbooks/${pbId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({
          name: 'Road Trip 2026',
          isPublic: true,
        }),
      });
      expect(patchRes.status).toBe(200);
      const body = await patchRes.json();
      const pb = pocketbookSchema.parse(body);
      expect(pb.name).toBe('Road Trip 2026');
      expect(pb.isPublic).toBe(true);
      expect(pb.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('rejects empty patch @smoke', async () => {
      const familyId = seedId('pocketbook/family');
      const res = await ctx.app.request(`/pocketbooks/${familyId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });
});
