import { describe, it, expect } from 'vitest';
import { setupApiTest, seedId } from './helpers';
import { categoryListSchema, categorySchema } from '@pb/shared';

describe('categories routes', () => {
  const ctx = setupApiTest();

  it('GET /pocketbooks/family/categories → 200 with 7 categories in order', async () => {
    const res = await ctx.app.request('/pocketbooks/family/categories', {
      headers: ctx.as(),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = categoryListSchema.parse(body);

    expect(parsed.data).toHaveLength(7);
    expect(parsed.data.map((c) => c.slug)).toEqual([
      'general',
      'school',
      'health',
      'food',
      'admin',
      'home',
      'fun',
    ]);
  });

  it('POST /pocketbooks/family/categories with {name:"Travel Plans"} → 201', async () => {
    const res = await ctx.app.request('/pocketbooks/family/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Travel Plans' }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    const parsed = categorySchema.parse(body);
    expect(parsed.slug).toBe('travel-plans');
    expect(parsed.visibility).toBe('shared');
    expect(parsed.position).toBe(7);
    expect(parsed.isDefault).toBe(false);
  });

  it('POST /pocketbooks/family/categories with same name → 409', async () => {
    const res = await ctx.app.request('/pocketbooks/family/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Travel Plans' }),
    });
    expect(res.status).toBe(409);
  });

  it('POST /pocketbooks/family/categories with {name:"Kids", slug:"kids", visibility:"private", position:2} → 201', async () => {
    const res = await ctx.app.request('/pocketbooks/family/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        name: 'Kids',
        slug: 'kids',
        visibility: 'private',
        position: 2,
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    const parsed = categorySchema.parse(body);
    expect(parsed.name).toBe('Kids');
    expect(parsed.slug).toBe('kids');
    expect(parsed.visibility).toBe('private');
    expect(parsed.position).toBe(2);
    expect(parsed.isDefault).toBe(false);
  });

  it('POST /pocketbooks/other-personal/categories as dev → 404', async () => {
    const res = await ctx.app.request('/pocketbooks/other-personal/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Some Category' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE default category via SQL → P0001 constraint', async () => {
    const familyPocketbookId = seedId('pocketbook/family');

    let error: any;
    try {
      await ctx.t.pool.query('DELETE FROM categories WHERE pocketbook_id=$1 AND is_default', [
        familyPocketbookId,
      ]);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe('P0001');
  });
});
