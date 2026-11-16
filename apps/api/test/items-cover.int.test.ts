import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { items, type DeckRow, type UserRow } from '@gobbit/db';
import {
  addMember,
  createAccountUser,
  createAsset,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import { itemEventPageSchema, type ItemEvent } from '@gobbit/shared';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { buildServices } from '../src/services';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

const capture = captureLogger();
const NO_COVER = 'This card type has no cover image';

/** 044 (D406–D414): the optional cover image on text, reminder, event, table and calc cards. */
describe('card cover image (044)', () => {
  const ctx = setupApiTest({
    logger: capture.logger,
    search: { embedder: createFakeEmbedder() },
  });
  let deck: DeckRow;
  let other: DeckRow;
  let reader: UserRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    other = await createDeck(ctx.t.db, ctx.world.owner);
    reader = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, reader, 'reader');
    await ctx.sessionFor(reader);
  });

  const send = (method: string, path: string, body?: unknown, email?: string) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const create = (body: Record<string, unknown>) => send('POST', `/decks/${deck.id}/items`, body);
  const patch = (id: string, body: Record<string, unknown>, email?: string) =>
    send('PATCH', `/items/${id}`, body, email);
  const textCard = (extra: Record<string, unknown> = {}) => ({
    type: 'text',
    title: 'Babysitter',
    body: 'Call Dana',
    ...extra,
  });
  async function card(extra: Record<string, unknown> = {}) {
    const res = await create(textCard(extra));
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string; cover: unknown };
  }
  async function log(): Promise<ItemEvent[]> {
    const res = await send('GET', `/decks/${deck.id}/events`);
    expect(res.status).toBe(200);
    return itemEventPageSchema.parse(await json(res)).data;
  }
  async function expectRefused(res: Response, path: string, message: string) {
    expect(res.status).toBe(422);
    const problem = await json(res);
    expect(problem.type).toBe('/problems/validation');
    expect(problem.errors).toEqual([{ path, message }]);
  }

  describe('create and update', () => {
    it('creates with a cover and copies the dimensions from the asset', async () => {
      const asset = await createAsset(ctx.t.db, deck, { width: 1200, height: 1600 });
      const item = await card({ cover: { publicId: asset.publicId } });
      expect(item.cover).toEqual({ publicId: asset.publicId, width: 1200, height: 1600 });
      const read = await json(await send('GET', `/items/${item.id}`));
      expect(read.cover).toEqual(item.cover);
    });

    it('omits dimensions the asset does not have, and answers null without a cover', async () => {
      const bare = await createAsset(ctx.t.db, deck, { width: null, height: null });
      const item = await card({ cover: { publicId: bare.publicId } });
      expect(item.cover).toEqual({ publicId: bare.publicId });
      expect((await card()).cover).toBeNull();
    });

    it('PATCH: absent keeps it, a publicId sets and replaces it, null removes it', async () => {
      const a = await createAsset(ctx.t.db, deck, { width: 100, height: 200 });
      const b = await createAsset(ctx.t.db, deck, { width: 300, height: 400 });
      const item = await card();

      const set = await json(await patch(item.id, { cover: { publicId: a.publicId } }));
      expect(set.cover).toEqual({ publicId: a.publicId, width: 100, height: 200 });
      const kept = await json(await patch(item.id, { title: 'Renamed' }));
      expect(kept.cover).toEqual(set.cover);
      const replaced = await json(await patch(item.id, { cover: { publicId: b.publicId } }));
      expect(replaced.cover).toEqual({ publicId: b.publicId, width: 300, height: 400 });
      const removed = await json(await patch(item.id, { cover: null }));
      expect(removed.cover).toBeNull();
    });

    it('works on a proposal for a publisher', async () => {
      const asset = await createAsset(ctx.t.db, deck);
      const proposal = await card({ status: 'proposed' });
      const res = await patch(proposal.id, { cover: { publicId: asset.publicId } });
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({
        status: 'proposed',
        cover: { publicId: asset.publicId },
      });
    });

    it('a reader cannot set one', async () => {
      const asset = await createAsset(ctx.t.db, deck);
      const item = await card();
      const res = await patch(item.id, { cover: { publicId: asset.publicId } }, reader.email);
      expect(res.status).toBe(403);
      expect((await json(await send('GET', `/items/${item.id}`))).cover).toBeNull();
    });
  });

  describe('refusals', () => {
    it('refuses a cover on link, media and the legacy image alias (422 cover)', async () => {
      const asset = await createAsset(ctx.t.db, deck);
      const cover = { publicId: asset.publicId };
      const bodies = [
        { type: 'link', title: 'Site', payload: { url: 'https://example.com/' }, cover },
        { type: 'media', title: 'Photo', payload: { kind: 'image', images: [cover] }, cover },
        { type: 'image', title: 'Photo', payload: { publicId: asset.publicId }, cover },
      ];
      for (const body of bodies) await expectRefused(await create(body), 'cover', NO_COVER);
    });

    it('refuses an unknown, other-deck or PDF image with one message (D408)', async () => {
      const foreign = await createAsset(ctx.t.db, other);
      const pdf = await createAsset(ctx.t.db, deck, { kind: 'pdf', pages: 2 });
      const item = await card();
      for (const publicId of ['samples/nope', foreign.publicId, pdf.publicId]) {
        const body = { cover: { publicId } };
        await expectRefused(await patch(item.id, body), 'cover.publicId', 'Unknown image');
        await expectRefused(await create(textCard(body)), 'cover.publicId', 'Unknown image');
      }
    });

    it('refuses width, height or any other key in the input, and a bad publicId', async () => {
      const asset = await createAsset(ctx.t.db, deck);
      const item = await card();
      for (const cover of [
        { publicId: asset.publicId, width: 10 },
        { publicId: asset.publicId, height: 10 },
        { publicId: asset.publicId, alt: 'x' },
        { publicId: '' },
        { publicId: 'x'.repeat(256) },
      ]) {
        expect((await patch(item.id, { cover })).status, JSON.stringify(cover)).toBe(422);
      }
    });

    it('logs each refusal as an item.cover decision with its reason', async () => {
      const asset = await createAsset(ctx.t.db, deck);
      const foreign = await createAsset(ctx.t.db, other);
      const item = await card();
      await create({
        type: 'link',
        title: 'Site',
        payload: { url: 'https://example.com/' },
        cover: { publicId: asset.publicId },
      });
      await patch(item.id, { cover: { publicId: 'samples/nope' } });
      await patch(item.id, { cover: { publicId: foreign.publicId } });
      await capture.flush();
      for (const reason of ['unsupported_type', 'unknown_image', 'other_deck']) {
        expectDecision(capture.lines, 'item.cover', { outcome: 'refused', reason });
      }
    });
  });

  describe('activity log (ADR-057)', () => {
    it('logs cover on add, replace and remove, and nothing for the same publicId', async () => {
      const a = await createAsset(ctx.t.db, deck);
      const b = await createAsset(ctx.t.db, deck);
      const item = await card();
      const steps = [
        { cover: { publicId: a.publicId } },
        { cover: { publicId: a.publicId } }, // no-op: writes nothing
        { cover: { publicId: b.publicId } },
        { cover: null },
      ];
      for (const body of steps) expect((await patch(item.id, body)).status).toBe(200);

      const updates = (await log()).filter((l) => l.itemId === item.id && l.kind === 'updated');
      expect(updates).toHaveLength(3);
      expect(updates.every((l) => l.changes.includes('cover'))).toBe(true);
    });
  });

  describe('no cover from ingestion, imports or public reads (D414)', () => {
    it('proposals from the pipeline and imports have cover = null', async () => {
      const { ingest } = buildServices({
        db: ctx.t.db,
        env: ctx.env,
        mailer: ctx.mailer,
        now: ctx.clock.now,
        search: { embedder: null },
      });
      await ingest.proposeDirect({
        user: ctx.world.owner,
        deck: deck.id,
        draft: { type: 'text', title: 'From share', body: 'x', payload: {} },
        channel: 'pwa',
      });
      const res = await send('POST', `/decks/${deck.id}/imports`, {
        label: 'notes.md',
        rows: [{ type: 'text', title: 'Imported', body: 'y' }],
      });
      expect(res.status).toBeLessThan(300);

      const rows = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
      for (const title of ['From share', 'Imported']) {
        const row = rows.find((r) => r.title === title);
        expect(row, title).toBeDefined();
        expect(row!.cover).toBeNull();
      }
    });

    it('public deck items and public search results carry no cover key', async () => {
      const pub = await createDeck(ctx.t.db, ctx.world.owner, {
        slug: 'cover-public',
        kind: 'communal',
        isPublic: true,
      });
      const category = await createCategory(ctx.t.db, pub, { slug: 'open', visibility: 'public' });
      const asset = await createAsset(ctx.t.db, pub);
      const item = await createItem(ctx.t.db, pub, {
        card: { type: 'text', title: 'Quokka corner', body: 'quokka', payload: {} },
        categoryIds: [category.id],
      });
      await ctx.t.db
        .update(items)
        .set({ cover: { publicId: asset.publicId } })
        .where(eq(items.id, item.id));

      const anon = { headers: ctx.anon() };
      const list = await json(await ctx.app.request('/public/cover-public/items', anon));
      expect(list.data.map((i: { id: string }) => i.id)).toContain(item.id);
      for (const i of list.data) expect(i).not.toHaveProperty('cover');

      const found = await json(await ctx.app.request('/public/cover-public/search?q=quokka', anon));
      expect(found.data.length).toBeGreaterThan(0);
      for (const hit of found.data) expect(hit.item).not.toHaveProperty('cover');
    });
  });
});
