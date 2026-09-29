import { describe, it, expect, beforeAll } from 'vitest';
import { setupApiTest, seedId } from './helpers';
import { itemSchema } from '@pb/shared';

const ctx = setupApiTest();
let generalId: string;
let foodCategoryId: string;

describe('Items Integration Tests', () => {
  beforeAll(async () => {
    // Get general category from smoke deck
    const categoriesRes = await ctx.app.request('/decks/smoke/categories', {
      headers: ctx.as(),
    });
    expect(categoriesRes.status).toBe(200);
    const categoriesData = await categoriesRes.json();
    const general = categoriesData.data.find((c: any) => c.isDefault);
    expect(general).toBeDefined();
    generalId = general.id;

    // Get food category ID for testing cross-deck validation
    foodCategoryId = seedId('family/food');
  });

  it('POST text with defaults → 201, published, verifiedAt set, categoryIds=[generalId]', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'Hello',
        body: 'World',
      }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    itemSchema.parse(item);
    expect(item.status).toBe('published');
    expect(item.verifiedAt).not.toBeNull();
    expect(item.categoryIds).toEqual([generalId]);
    expect(item.type).toBe('text');
  });

  it('POST status proposed → verifiedAt null', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'Proposed',
        body: 'Content',
        status: 'proposed',
      }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.status).toBe('proposed');
    expect(item.verifiedAt).toBeNull();
  });

  it('GET /items/:id → 200 with same data', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'GetTest',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    const getRes = await ctx.app.request(`/items/${itemId}`, {
      headers: ctx.as(),
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(itemId);
    expect(fetched.title).toBe('GetTest');
    itemSchema.parse(fetched);
  });

  it('PATCH title → 200', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'Original',
        body: 'Content',
      }),
    });
    const created = await createRes.json();

    const patchRes = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ title: 'Hi' }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.title).toBe('Hi');
  });

  it('PATCH type → 400', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'ImmutableType',
        body: 'Content',
      }),
    });
    const created = await createRes.json();

    const patchRes = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ type: 'link' }),
    });
    expect(patchRes.status).toBe(400);
  });

  it('POST table item → 201', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'table',
        title: 'T',
        payload: {
          columns: ['a', 'b'],
          rows: [['1', '2']],
        },
      }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.type).toBe('table');
    itemSchema.parse(item);
  });

  it('PATCH table payload with ragged rows → 400', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'table',
        title: 'TableTest',
        payload: {
          columns: ['a', 'b'],
          rows: [['1', '2']],
        },
      }),
    });
    const created = await createRes.json();

    const patchRes = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({
        payload: {
          columns: ['a'],
          rows: [['1', '2']],
        },
      }),
    });
    expect(patchRes.status).toBe(400);
  });

  it('PATCH table with wrong payload type → 400', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'table',
        title: 'TableTest2',
        payload: {
          columns: ['a', 'b'],
          rows: [['1', '2']],
        },
      }),
    });
    const created = await createRes.json();

    const patchRes = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({
        payload: { url: 'https://x.test' },
      }),
    });
    expect(patchRes.status).toBe(400);
  });

  it('PATCH published item categoryIds to empty → 422 /problems/item-needs-category', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'NeedsCat',
        body: 'Content',
        status: 'published',
      }),
    });
    const created = await createRes.json();

    const patchRes = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ categoryIds: [] }),
    });
    expect(patchRes.status).toBe(422);
    const problem = await patchRes.json();
    expect(problem.type).toBe('/problems/item-needs-category');
  });

  it('POST with categoryIds from another deck → 400 and errors include that id', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'WrongCategory',
        body: 'Content',
        categoryIds: [foodCategoryId],
      }),
    });
    expect(res.status).toBe(400);
    const problem = await res.json();
    expect(problem.errors).toBeDefined();
    expect(problem.errors.some((e: any) => e.message === foodCategoryId)).toBe(true);
  });

  it('POST body exceeding character limit → 400 and errors[0].path body', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'LongBody',
        body: 'a'.repeat(601),
      }),
    });
    expect(res.status).toBe(400);
    const problem = await res.json();
    expect(problem.errors).toBeDefined();
    expect(problem.errors[0]?.path).toBe('body');
  });

  it('POST body with 600 Hebrew characters → 201', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'Hebrew',
        body: 'א'.repeat(600),
      }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    itemSchema.parse(item);
  });

  it('POST link with javascript: URL → 400', async () => {
    const res = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'link',
        title: 'BadLink',
        payload: {
          url: 'javascript:alert(1)',
        },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /items/:id/archive twice → both 200 status archived', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'ArchiveTest',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    const archive1 = await ctx.app.request(`/items/${itemId}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(archive1.status).toBe(200);
    let item = await archive1.json();
    expect(item.status).toBe('archived');

    const archive2 = await ctx.app.request(`/items/${itemId}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(archive2.status).toBe(200);
    item = await archive2.json();
    expect(item.status).toBe('archived');
  });

  it('GET /decks/smoke/items excludes archived by default', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'ShouldBeExcluded',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    await ctx.app.request(`/items/${itemId}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });

    const listRes = await ctx.app.request('/decks/smoke/items', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeUndefined();
  });

  it('GET /decks/smoke/items?status=archived includes archived', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'ShouldBeIncluded',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    await ctx.app.request(`/items/${itemId}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });

    const listRes = await ctx.app.request('/decks/smoke/items?status=archived', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeDefined();
  });

  it('DELETE /items/:id → 204; GET → 404; not in any list', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'DeleteTest',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    const deleteRes = await ctx.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(deleteRes.status).toBe(204);

    const getRes = await ctx.app.request(`/items/${itemId}`, {
      headers: ctx.as(),
    });
    expect(getRes.status).toBe(404);

    const listRes = await ctx.app.request('/decks/smoke/items', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeUndefined();
  });

  it('DELETE /items/:id again → 404', async () => {
    const createRes = await ctx.app.request('/decks/smoke/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'DeleteAgain',
        body: 'Content',
      }),
    });
    const created = await createRes.json();
    const itemId = created.id;

    await ctx.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });

    const deleteRes = await ctx.app.request(`/items/${itemId}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(deleteRes.status).toBe(404);
  });

  it('GET /items/<random uuid> → 404', async () => {
    const res = await ctx.app.request(`/items/550e8400-e29b-41d4-a716-446655440000`, {
      headers: ctx.as(),
    });
    expect(res.status).toBe(404);
  });
});
