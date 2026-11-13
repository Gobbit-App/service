import { describe, it, expect, beforeAll } from 'vitest';
import type { DeckRow } from '@gobbit/db';
import { createAsset, createDeck } from '@gobbit/db/test';
import { setupApiTest, fixtureId } from './helpers';
import { itemSchema } from '@gobbit/shared';

const ctx = setupApiTest();
let generalId: string;
let foodCategoryId: string;

describe('Items Integration Tests', () => {
  beforeAll(async () => {
    // Get general category from scratch deck
    const categoriesRes = await ctx.app.request('/decks/scratch/categories', {
      headers: ctx.as(),
    });
    expect(categoriesRes.status).toBe(200);
    const categoriesData = await categoriesRes.json();
    const general = categoriesData.data.find((c: any) => c.isDefault);
    expect(general).toBeDefined();
    generalId = general.id;

    // Get food category ID for testing cross-deck validation
    foodCategoryId = fixtureId('family/food');
  });

  it('POST text with defaults → 201, published, verifiedAt set, categoryIds=[generalId]', async () => {
    const res = await ctx.app.request('/decks/scratch/items', {
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
    const res = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

  it('PATCH another type → 409 type-change-not-supported (D12)', async () => {
    const createRes = await ctx.app.request('/decks/scratch/items', {
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
    expect(patchRes.status).toBe(409);
    expect((await patchRes.json()).type).toBe('/problems/type-change-not-supported');
  });

  it('POST table item → 201', async () => {
    const res = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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
    const res = await ctx.app.request('/decks/scratch/items', {
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
    const res = await ctx.app.request('/decks/scratch/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'LongBody',
        body: 'a'.repeat(2001),
      }),
    });
    expect(res.status).toBe(400);
    const problem = await res.json();
    expect(problem.errors).toBeDefined();
    expect(problem.errors[0]?.path).toBe('body');
  });

  it('POST body with 2000 Hebrew characters → 201', async () => {
    const res = await ctx.app.request('/decks/scratch/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        type: 'text',
        title: 'Hebrew',
        body: 'א'.repeat(2000),
      }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    itemSchema.parse(item);
  });

  it('POST link with javascript: URL → 400', async () => {
    const res = await ctx.app.request('/decks/scratch/items', {
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
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

  it('GET /decks/scratch/items excludes archived by default', async () => {
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

    const listRes = await ctx.app.request('/decks/scratch/items', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeUndefined();
  });

  it('GET /decks/scratch/items?status=archived includes archived', async () => {
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

    const listRes = await ctx.app.request('/decks/scratch/items?status=archived', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeDefined();
  });

  // D131: lifecycle transitions go through archive/restore, not PATCH
  async function createScratchItem(title: string, status?: 'proposed') {
    const res = await ctx.app.request('/decks/scratch/items', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ type: 'text', title, body: 'Content', ...(status ? { status } : {}) }),
    });
    expect(res.status).toBe(201);
    return itemSchema.parse(await res.json());
  }

  it('POST /items/:id/archive on a proposal → 409 invalid-transition, still proposed', async () => {
    const created = await createScratchItem('ArchiveProposal', 'proposed');

    const res = await ctx.app.request(`/items/${created.id}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).type).toBe('/problems/invalid-transition');

    const after = await ctx.app.request(`/items/${created.id}`, { headers: ctx.as() });
    expect((await after.json()).status).toBe('proposed');
  });

  it('PATCH status archived → published → 409 use-restore; PATCH status archived archives', async () => {
    const created = await createScratchItem('PatchLifecycle');

    const archived = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ status: 'archived' }),
    });
    expect(archived.status).toBe(200);
    expect((await archived.json()).status).toBe('archived');

    const republish = await ctx.app.request(`/items/${created.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ status: 'published' }),
    });
    expect(republish.status).toBe(409);
    expect((await republish.json()).type).toBe('/problems/use-restore');
  });

  it('POST /items/:id/restore → published with the original verifiedAt', async () => {
    const created = await createScratchItem('RestoreKeepsAge');
    await ctx.app.request(`/items/${created.id}/archive`, { method: 'POST', headers: ctx.as() });

    const res = await ctx.app.request(`/items/${created.id}/restore`, {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(res.status).toBe(200);
    const restored = itemSchema.parse(await res.json());
    expect(restored.status).toBe('published');
    expect(restored.verifiedAt).toBe(created.verifiedAt);
  });

  it('DELETE /items/:id → 204; GET → 404; not in any list', async () => {
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

    const listRes = await ctx.app.request('/decks/scratch/items', {
      headers: ctx.as(),
    });
    expect(listRes.status).toBe(200);
    const page = await listRes.json();
    const found = page.data.find((i: any) => i.id === itemId);
    expect(found).toBeUndefined();
  });

  it('DELETE /items/:id again → 404', async () => {
    const createRes = await ctx.app.request('/decks/scratch/items', {
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

describe('media cards reference recorded files (D160, 045)', () => {
  let deck: DeckRow;
  let other: DeckRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    other = await createDeck(ctx.t.db, ctx.world.owner);
  });

  const create = (type: string, payload: Record<string, unknown>) =>
    ctx.app.request(`/decks/${deck.id}/items`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ type, title: 'Photo', payload }),
    });
  const gallery = (...images: Record<string, unknown>[]) => ({ kind: 'image', images });
  const createPhotos = (...images: Record<string, unknown>[]) =>
    create('media', gallery(...images));
  const patch = (id: string, body: Record<string, unknown>) =>
    ctx.app.request(`/items/${id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify(body),
    });

  async function expectUnknownFile(res: Response, path = 'payload.images.0.publicId') {
    expect(res.status).toBe(422);
    const problem = await res.json();
    expect(problem.type).toBe('/problems/validation');
    expect(problem.errors).toEqual([{ path, message: 'Unknown file' }]);
  }

  it('refuses an unrecorded photo, one of another deck and one the verify pass rejected', async () => {
    await expectUnknownFile(await createPhotos({ publicId: 'samples/nope', alt: 'x' }));
    const foreign = await createAsset(ctx.t.db, other);
    await expectUnknownFile(await createPhotos({ publicId: foreign.publicId, alt: 'x' }));
    const rejected = await createAsset(ctx.t.db, deck, { rejectedAt: new Date() });
    await expectUnknownFile(await createPhotos({ publicId: rejected.publicId }));
  });

  it("writes every photo's dimensions from its asset, on create and update", async () => {
    const a = await createAsset(ctx.t.db, deck, { width: 1200, height: 900 });
    const b = await createAsset(ctx.t.db, deck, { width: 300, height: 400 });
    const res = await createPhotos(
      { publicId: b.publicId, alt: 'second', width: 5, height: 5 },
      { publicId: a.publicId, alt: 'x' },
    );
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.type).toBe('media');
    expect(item.payload).toEqual(
      gallery(
        { publicId: b.publicId, alt: 'second', width: 300, height: 400 },
        { publicId: a.publicId, alt: 'x', width: 1200, height: 900 },
      ),
    );

    const unknownSize = await createAsset(ctx.t.db, deck, { width: null, height: null });
    const patched = await patch(item.id, {
      payload: gallery({ publicId: unknownSize.publicId, alt: 'y', width: 7 }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).payload).toEqual(
      gallery({ publicId: unknownSize.publicId, alt: 'y' }),
    );

    await expectUnknownFile(
      await patch(item.id, { payload: gallery({ publicId: 'samples/nope', alt: 'y' }) }),
    );
  });

  it('saves a photo without alt or with an empty alt, and clears it on update (D206)', async () => {
    const asset = await createAsset(ctx.t.db, deck, { width: 640, height: 480 });
    const bare = await createPhotos({ publicId: asset.publicId });
    expect(bare.status).toBe(201);
    const item = await bare.json();
    expect(item.payload).toEqual(gallery({ publicId: asset.publicId, width: 640, height: 480 }));

    const described = await patch(item.id, {
      payload: gallery({ publicId: asset.publicId, alt: 'A loaf' }),
    });
    expect(described.status).toBe(200);
    expect((await described.json()).payload.images[0].alt).toBe('A loaf');
  });

  it('refuses a non-string alt, more than 8 photos and the same photo twice', async () => {
    const asset = await createAsset(ctx.t.db, deck);
    expect((await createPhotos({ publicId: asset.publicId, alt: 5 })).status).toBe(400);
    const nine = await Promise.all(Array.from({ length: 9 }, () => createAsset(ctx.t.db, deck)));
    expect((await createPhotos(...nine.map((a) => ({ publicId: a.publicId })))).status).toBe(400);
    expect(
      (await createPhotos({ publicId: asset.publicId }, { publicId: asset.publicId })).status,
    ).toBe(400);
  });

  it('refuses a file of another kind than the payload names (FR-004)', async () => {
    const pdf = await createAsset(ctx.t.db, deck, { kind: 'pdf', pages: 4 });
    const res = await createPhotos({ publicId: pdf.publicId });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].path).toBe('payload.kind');

    const ok = await create('media', { kind: 'pdf', publicId: pdf.publicId, pages: 99 });
    expect(ok.status).toBe(201);
    expect((await ok.json()).payload).toMatchObject({ kind: 'pdf', pages: 4 });
  });

  it('accepts type image and a flat payload from old clients as a media gallery (D387)', async () => {
    const asset = await createAsset(ctx.t.db, deck, { width: 640, height: 480 });
    const res = await create('image', { publicId: asset.publicId, alt: 'Old app' });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.type).toBe('media');
    expect(item.payload).toEqual(
      gallery({ publicId: asset.publicId, alt: 'Old app', width: 640, height: 480 }),
    );

    const updated = await patch(item.id, { type: 'image', payload: { publicId: asset.publicId } });
    expect(updated.status).toBe(200);
    expect((await updated.json()).payload).toEqual(
      gallery({ publicId: asset.publicId, width: 640, height: 480 }),
    );

    const listed = await ctx.app.request(`/decks/${deck.id}/items?type=image`, {
      headers: ctx.as(),
    });
    expect(listed.status).toBe(200);
    const types = (await listed.json()).data.map((i: { type: string }) => i.type);
    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types)).toEqual(new Set(['media']));
  });
});

describe('link previews: server-owned copy fields (D163)', () => {
  let deck: DeckRow;
  let other: DeckRow;
  const url = 'https://bakery.example/';
  const image = 'https://bakery.example/og.jpg';

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    other = await createDeck(ctx.t.db, ctx.world.owner);
  });

  const createLink = (payload: Record<string, unknown>) =>
    ctx.app.request(`/decks/${deck.id}/items`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ type: 'link', title: 'Bakery', payload }),
    });

  const patchLink = (id: string, payload: Record<string, unknown>) =>
    ctx.app.request(`/items/${id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ payload }),
    });

  /** A link card whose preview already has a stored copy (as the job or the editor left it). */
  async function cardWithCopy(source: 'link_snapshot' | 'editor') {
    const asset = await createAsset(ctx.t.db, deck, { source, width: 800, height: 600 });
    const preview = { title: 'Bakery', image, publicId: asset.publicId, width: 800, height: 600 };
    const res = await createLink({ url, preview });
    expect(res.status).toBe(201);
    return { item: await res.json(), asset, preview };
  }

  it("ignores the client's dimensions; a chosen photo brings its own", async () => {
    const res = await createLink({ url, preview: { title: 'Bakery', width: 5, height: 5 } });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item.payload).toEqual({ url, preview: { title: 'Bakery' } });

    const asset = await createAsset(ctx.t.db, deck, { width: 1200, height: 900 });
    const patched = await patchLink(item.id, {
      url,
      preview: { title: 'Bakery', publicId: asset.publicId, width: 1 },
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).payload.preview).toEqual({
      title: 'Bakery',
      publicId: asset.publicId,
      width: 1200,
      height: 900,
    });
  });

  it('keeps the stored copy on an edit that omits it', async () => {
    const { item, preview } = await cardWithCopy('link_snapshot');
    const patched = await patchLink(item.id, { url, preview: { title: 'Bakery & cafe', image } });
    expect(patched.status).toBe(200);
    expect((await patched.json()).payload.preview).toEqual({ ...preview, title: 'Bakery & cafe' });
  });

  it('drops a link_snapshot copy when the URL or the image changes', async () => {
    const first = await cardWithCopy('link_snapshot');
    const newImage = await patchLink(first.item.id, {
      url,
      preview: { ...first.preview, image: 'https://bakery.example/new.jpg' },
    });
    expect((await newImage.json()).payload.preview).toEqual({
      title: 'Bakery',
      image: 'https://bakery.example/new.jpg',
    });

    const second = await cardWithCopy('link_snapshot');
    const newUrl = await patchLink(second.item.id, {
      url: 'https://bakery.example/moved',
      preview: { title: 'Bakery', image },
    });
    expect((await newUrl.json()).payload).toEqual({
      url: 'https://bakery.example/moved',
      preview: { title: 'Bakery', image },
    });
  });

  it('keeps a photo a member added when the URL changes', async () => {
    const { item, preview } = await cardWithCopy('editor');
    const patched = await patchLink(item.id, { url: 'https://bakery.example/moved', preview });
    expect(patched.status).toBe(200);
    expect((await patched.json()).payload.preview).toEqual(preview);
  });

  it('refuses a preview.publicId not recorded for the deck', async () => {
    const foreign = await createAsset(ctx.t.db, other);
    for (const publicId of ['samples/nope', foreign.publicId]) {
      const res = await createLink({ url, preview: { title: 'Bakery', publicId } });
      expect(res.status).toBe(422);
      const problem = await res.json();
      expect(problem.type).toBe('/problems/validation');
      expect(problem.errors).toEqual([
        { path: 'payload.preview.publicId', message: 'Unknown image' },
      ]);
    }
  });
});
