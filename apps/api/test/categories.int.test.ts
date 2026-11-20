import { describe, it, expect } from 'vitest';
import { setupApiTest, fixtureId } from './helpers';
import { categoryListSchema, categorySchema } from '@gobbit/shared';
import { toCategorySlug } from '../src/lib/slug';

describe('categories routes', () => {
  const ctx = setupApiTest();

  it('GET /decks/family/categories → 200 with 7 categories, default first then A–Z (D402)', async () => {
    const res = await ctx.app.request('/decks/family/categories', {
      headers: ctx.as(),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = categoryListSchema.parse(body);

    expect(parsed.data).toHaveLength(7);
    expect(parsed.data.map((c) => c.slug)).toEqual([
      'general',
      'admin',
      'food',
      'fun',
      'health',
      'home',
      'school',
    ]);
  });

  it('POST /decks/family/categories with {name:"Travel Plans"} → 201', async () => {
    const res = await ctx.app.request('/decks/family/categories', {
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

  it('POST /decks/family/categories with same name → 409', async () => {
    const res = await ctx.app.request('/decks/family/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Travel Plans' }),
    });
    expect(res.status).toBe(409);
  });

  it('POST /decks/family/categories with {name:"Kids", slug:"kids", visibility:"private", position:2} → 201', async () => {
    const res = await ctx.app.request('/decks/family/categories', {
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

  it('a Hebrew name gets its derived address (D445)', async () => {
    const res = await ctx.app.request('/decks/family/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'שלום' }),
    });
    expect(res.status).toBe(201);
    const parsed = categorySchema.parse(await res.json());
    expect(parsed.slug).toBe(toCategorySlug('שלום'));
    expect(parsed.slug).toMatch(/^c-[0-9a-f]{8}$/);
  });

  it('a Hebrew name whose address is taken → 409 asking for an explicit slug', async () => {
    const post = (body: object) =>
      ctx.app.request('/decks/family/categories', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify(body),
      });
    expect((await post({ name: 'Taken', slug: toCategorySlug('בריאות') })).status).toBe(201);

    const res = await post({ name: 'בריאות' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail: string }).detail).toContain(
      'provide "slug" explicitly',
    );
  });

  it('POST /decks/other-personal/categories as dev → 404', async () => {
    const res = await ctx.app.request('/decks/other-personal/categories', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Some Category' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE default category via SQL → P0001 constraint', async () => {
    const familyDeckId = fixtureId('deck/family');

    let error: any;
    try {
      await ctx.t.pool.query('DELETE FROM categories WHERE deck_id=$1 AND is_default', [
        familyDeckId,
      ]);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe('P0001');
  });
});
