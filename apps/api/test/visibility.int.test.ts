import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemRow, UserRow } from '@pb/db';
import { addMember, createAccountUser, createItem } from '@pb/db/test';
import { json, OWNER_EMAIL, setupApiTest } from './helpers';

describe('category visibility (P2.6, D38)', () => {
  const ctx = setupApiTest();
  let reader: UserRow;
  let editor: UserRow;
  let adminOnly: ItemRow;
  let adminAndHome: ItemRow;
  let adminId: string;
  let homeId: string;

  beforeAll(async () => {
    const { family } = ctx.world.decks;
    adminId = ctx.world.categories.admin.id;
    homeId = ctx.world.categories.home.id;
    await ctx.t.pool.query(`UPDATE categories SET visibility = 'private' WHERE id = $1`, [adminId]);

    adminOnly = await createItem(ctx.t.db, family, {
      card: { type: 'text', title: 'Admin only', payload: {} },
      categoryIds: [adminId],
    });
    adminAndHome = await createItem(ctx.t.db, family, {
      card: { type: 'text', title: 'Admin and home', payload: {} },
      categoryIds: [adminId, homeId],
    });

    reader = await createAccountUser(ctx.t.db);
    editor = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, family, reader, 'reader');
    await addMember(ctx.t.db, family, editor, 'editor');
    await ctx.sessionFor(reader);
    await ctx.sessionFor(editor);
  });

  const get = (path: string, email: string) => ctx.app.request(path, { headers: ctx.as(email) });
  const send = (method: string, path: string, email: string, body: unknown) =>
    ctx.app.request(path, { method, headers: ctx.as(email), body: JSON.stringify(body) });

  const categorySlugs = async (email: string) =>
    (await json(await get('/decks/family/categories', email))).data.map(
      (c: { slug: string }) => c.slug,
    );

  /** Every published item id of `family` visible to `email`, following cursors. */
  async function allItemIds(email: string, limit: number): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
      const page = await json(await get(`/decks/family/items?${qs}`, email));
      ids.push(...page.data.map((i: { id: string }) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    return ids;
  }

  it('the owner sees the private category; the reader does not', async () => {
    expect(await categorySlugs(OWNER_EMAIL)).toContain('admin');
    const readerSlugs = await categorySlugs(reader.email);
    expect(readerSlugs).not.toContain('admin');
    expect(readerSlugs).toContain('home');
  });

  it('the reader’s item list never includes an admin-only card', async () => {
    const ids = await allItemIds(reader.email, 50);
    expect(ids).not.toContain(adminOnly.id);
    expect(ids).toContain(adminAndHome.id);
  });

  it('filtering by the private category is 404 for the reader', async () => {
    expect((await get('/decks/family/items?category=admin', reader.email)).status).toBe(404);
    expect((await get('/decks/family/items?category=admin', OWNER_EMAIL)).status).toBe(200);
  });

  it('an admin-only card is 404 for the reader', async () => {
    expect((await get(`/items/${adminOnly.id}`, reader.email)).status).toBe(404);
  });

  it('a card in admin + home shows only the visible category id to the reader', async () => {
    const asReader = await json(await get(`/items/${adminAndHome.id}`, reader.email));
    expect(asReader.categoryIds).toEqual([homeId]);

    const asOwner = await json(await get(`/items/${adminAndHome.id}`, OWNER_EMAIL));
    expect([...asOwner.categoryIds].sort()).toEqual([adminId, homeId].sort());
  });

  it('an editor cannot file a card under the private category (unknown category)', async () => {
    const res = await send('POST', '/decks/family/items', editor.email, {
      type: 'text',
      title: 'Sneaky',
      payload: {},
      categoryIds: [adminId],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).toContain('categoryIds');
  });

  it('an editor cannot create a private category', async () => {
    const res = await send('POST', '/decks/family/categories', editor.email, {
      name: 'Secret',
      slug: 'secret',
      visibility: 'private',
    });
    expect(res.status).toBe(403);
  });

  it('an editor cannot create a public category either (shared only)', async () => {
    const res = await send('POST', '/decks/family/categories', editor.email, {
      name: 'Open',
      slug: 'open',
      visibility: 'public',
    });
    expect(res.status).toBe(403);
  });

  it('paginates the reader’s view consistently with the owner’s minus hidden cards', async () => {
    const ownerIds = await allItemIds(OWNER_EMAIL, 50);
    const readerIds = await allItemIds(reader.email, 3);
    expect(new Set(readerIds).size).toBe(readerIds.length);

    const hidden = await ctx.t.pool.query(
      `SELECT i.id FROM items i WHERE i.deck_id = $1 AND NOT EXISTS (
         SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
         WHERE ic.item_id = i.id AND c.visibility <> 'private')`,
      [ctx.world.decks.family.id],
    );
    const hiddenIds = new Set(hidden.rows.map((r: { id: string }) => r.id));
    expect(hiddenIds.size).toBeGreaterThan(0);
    expect(readerIds).toEqual(ownerIds.filter((id) => !hiddenIds.has(id)));
  });

  it('removing home from a shared card hides it from the reader', async () => {
    const res = await send('PATCH', `/items/${adminAndHome.id}`, OWNER_EMAIL, {
      categoryIds: [adminId],
    });
    expect(res.status).toBe(200);
    expect((await get(`/items/${adminAndHome.id}`, reader.email)).status).toBe(404);
  });
});
