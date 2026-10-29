import { describe, expect, it } from 'vitest';
import { itemSchema } from '@gobbit/shared';
import { json, setupApiTest } from './helpers';

/** D97: entities are a cross-type column, written with the card and searchable through search_text. */
describe('item entities (D97)', () => {
  const ctx = setupApiTest();

  const post = (body: unknown) =>
    ctx.app.request('/decks/scratch/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify(body),
    });

  const hitIds = async (q: string): Promise<string[]> => {
    const res = await ctx.app.request(`/decks/scratch/search?${new URLSearchParams({ q })}`, {
      headers: ctx.as(),
    });
    expect(res.status).toBe(200);
    return (await json(res)).data.map((h: { item: { id: string } }) => h.item.id);
  };

  it('defaults to an empty object', async () => {
    const res = await post({ type: 'text', title: 'No entities', body: 'plain' });
    expect(res.status).toBe(201);
    expect((await json(res)).entities).toEqual({});
  });

  it('stores entities compacted and finds the card by one of them', async () => {
    const res = await post({
      type: 'text',
      title: 'Plumber',
      body: 'Call before 9',
      entities: { phones: ['03-555-0199'], people: [] },
    });
    expect(res.status).toBe(201);
    const item = itemSchema.parse(await json(res));
    expect(item.entities).toEqual({ phones: ['03-555-0199'] });
    expect(await hitIds('555-0199')).toContain(item.id);
  });

  it('PATCH replaces entities and search follows', async () => {
    const created = await json(await post({ type: 'text', title: 'Bakery', body: 'Fresh bread' }));
    const res = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ entities: { addresses: ['12 Herzl Street'] } }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).entities).toEqual({ addresses: ['12 Herzl Street'] });
    expect(await hitIds('herzl')).toContain(created.id);
  });

  it('rejects unknown entity kinds', async () => {
    const res = await post({
      type: 'text',
      title: 'Bad',
      body: 'x',
      entities: { colors: ['red'] },
    });
    expect(res.status).toBe(400);
  });
});
