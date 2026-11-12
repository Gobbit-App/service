import { beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import {
  ingestJobs,
  itemEvents,
  items,
  type DeckRow,
  type ItemRow,
  type UserRow,
} from '@gobbit/db';
import { addMember, createAccountUser, createAsset, createDeck, createItem } from '@gobbit/db/test';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

interface Cover {
  publicId: string;
  width: number;
  height: number;
}

describe('card cover (D386)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({
    logger: capture.logger,
    search: { embedder: createFakeEmbedder() },
    ingest: { enabled: true, queue: { enqueue: async () => undefined } },
  });
  let editor: UserRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(editor);
  });

  describe('reads', () => {
    /** Sets the cover straight in the DB, with a matching asset row for the deck. */
    async function withCover(deck: DeckRow, item: ItemRow): Promise<Cover> {
      const asset = await createAsset(ctx.t.db, deck, { width: 640, height: 480 });
      const cover = { publicId: asset.publicId, width: 640, height: 480 };
      await ctx.t.db.update(items).set({ cover }).where(eq(items.id, item.id));
      return cover;
    }

    it('GET /items/{id} returns the cover, or null without one', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      const covered = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Covered card', body: 'zebrafinch nest' },
      });
      const plain = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Plain card', body: 'no picture' },
      });
      const cover = await withCover(deck, covered);

      const a = await ctx.app.request(`/items/${covered.id}`, { headers: ctx.as() });
      expect(a.status).toBe(200);
      expect((await json(a)).cover).toEqual(cover);

      const b = await ctx.app.request(`/items/${plain.id}`, { headers: ctx.as() });
      expect(b.status).toBe(200);
      expect((await json(b)).cover).toBeNull();
    });

    it('GET /decks/{id}/items returns the cover per card', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      const covered = await createItem(ctx.t.db, deck, { card: { type: 'text', title: 'With' } });
      const plain = await createItem(ctx.t.db, deck, { card: { type: 'text', title: 'Without' } });
      const cover = await withCover(deck, covered);

      const res = await ctx.app.request(`/decks/${deck.id}/items`, { headers: ctx.as() });
      expect(res.status).toBe(200);
      const byId = new Map<string, { cover: unknown }>(
        (await json(res)).data.map((i: { id: string; cover: unknown }) => [i.id, i]),
      );
      expect(byId.get(covered.id)?.cover).toEqual(cover);
      expect(byId.get(plain.id)?.cover).toBeNull();
    });

    it('member search returns the cover on hits', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      const covered = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Quokka feeding', body: 'quokka pellets' },
      });
      const cover = await withCover(deck, covered);

      const res = await ctx.app.request(`/decks/${deck.slug}/search?q=quokka`, {
        headers: ctx.as(),
      });
      expect(res.status).toBe(200);
      const hit = (await json(res)).data.find(
        (h: { item: { id: string } }) => h.item.id === covered.id,
      );
      expect(hit.item.cover).toEqual(cover);
    });

    it('the review queue returns the cover on a proposed item', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      await addMember(ctx.t.db, deck, editor, 'editor');
      const proposed = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Proposed with picture', body: 'x' },
        status: 'proposed',
        verifiedAt: null,
        createdBy: editor.id,
      });
      const cover = await withCover(deck, proposed);
      await ctx.t.db.insert(ingestJobs).values({
        userId: editor.id,
        deckId: deck.id,
        channel: 'pwa',
        status: 'proposed',
        raw: { text: 'x', images: [] },
        dedup: { action: 'new', itemId: null, similarity: null, via: 'none' },
        resultItemId: proposed.id,
      });

      const res = await ctx.app.request(`/decks/${deck.id}/review`, { headers: ctx.as() });
      expect(res.status).toBe(200);
      const entry = (await json(res)).data.find(
        (e: { item: { id: string } }) => e.item.id === proposed.id,
      );
      expect(entry.item.cover).toEqual(cover);
    });
  });

  describe('writes', () => {
    async function deckWithEditor(): Promise<DeckRow> {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      await addMember(ctx.t.db, deck, editor, 'editor');
      return deck;
    }

    const post = (deckId: string, body: Record<string, unknown>, email?: string) =>
      ctx.app.request(`/decks/${deckId}/items`, {
        method: 'POST',
        headers: ctx.as(email),
        body: JSON.stringify(body),
      });
    const patch = (itemId: string, body: Record<string, unknown>, email?: string) =>
      ctx.app.request(`/items/${itemId}`, {
        method: 'PATCH',
        headers: ctx.as(email),
        body: JSON.stringify(body),
      });
    const text = (extra: Record<string, unknown> = {}) => ({
      type: 'text',
      title: 'Babysitter',
      body: 'Call Dana',
      ...extra,
    });
    const errorPaths = async (res: Response) =>
      (await json(res)).errors.map((e: { path: string; message: string }) => [e.path, e.message]);
    const eventsFor = (itemId: string) =>
      ctx.t.db
        .select()
        .from(itemEvents)
        .where(and(eq(itemEvents.itemId, itemId), eq(itemEvents.kind, 'updated')))
        .orderBy(asc(itemEvents.createdAt));

    it('create with a cover copies the dimensions from the asset', async () => {
      const deck = await deckWithEditor();
      const asset = await createAsset(ctx.t.db, deck, { width: 1200, height: 1600 });
      const res = await post(deck.id, text({ cover: { publicId: asset.publicId } }));
      expect(res.status).toBe(201);
      expect((await json(res)).cover).toEqual({
        publicId: asset.publicId,
        width: 1200,
        height: 1600,
      });
    });

    it('PATCH sets, replaces, leaves unchanged when absent, and removes with null', async () => {
      const deck = await deckWithEditor();
      const a = await createAsset(ctx.t.db, deck);
      const b = await createAsset(ctx.t.db, deck, { width: 100, height: 200 });
      const created = await json(await post(deck.id, text()));
      expect(created.cover).toBeNull();

      const set = await patch(created.id, { cover: { publicId: a.publicId } });
      expect(set.status).toBe(200);
      expect((await json(set)).cover).toMatchObject({ publicId: a.publicId });

      const same = await patch(created.id, { title: 'Babysitter 2' });
      expect((await json(same)).cover).toMatchObject({ publicId: a.publicId });

      const replaced = await patch(created.id, { cover: { publicId: b.publicId } });
      expect((await json(replaced)).cover).toEqual({
        publicId: b.publicId,
        width: 100,
        height: 200,
      });

      const removed = await patch(created.id, { cover: null });
      expect(removed.status).toBe(200);
      expect((await json(removed)).cover).toBeNull();
    });

    it('logs one updated event naming cover on add, replace and remove, none on a no-op', async () => {
      const deck = await deckWithEditor();
      const a = await createAsset(ctx.t.db, deck);
      const b = await createAsset(ctx.t.db, deck);
      const created = await json(await post(deck.id, text()));

      await patch(created.id, { cover: { publicId: a.publicId } });
      await patch(created.id, { cover: { publicId: a.publicId } }); // no-op
      await patch(created.id, { cover: { publicId: b.publicId } });
      await patch(created.id, { cover: null });
      await patch(created.id, { cover: null }); // no-op

      const rows = await eventsFor(created.id);
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row.changes).toContain('cover');
    });

    it.each(['link', 'image'])('refuses a cover on a %s card (create and PATCH)', async (type) => {
      const deck = await deckWithEditor();
      const asset = await createAsset(ctx.t.db, deck);
      const cover = { publicId: asset.publicId };
      const payload =
        type === 'link'
          ? { url: 'https://example.org/page' }
          : { publicId: asset.publicId, alt: 'x', width: 640, height: 480 };
      const card = { type, title: 'Plain', payload };

      const created = await post(deck.id, { ...card, cover });
      expect(created.status).toBe(422);
      expect(await errorPaths(created)).toEqual([['cover', 'This card type has no cover image']]);

      const ok = await post(deck.id, card);
      expect(ok.status).toBe(201);
      const id = (await json(ok)).id;
      const patched = await patch(id, { cover });
      expect(patched.status).toBe(422);
      expect(await errorPaths(patched)).toEqual([['cover', 'This card type has no cover image']]);

      // Clearing is always fine.
      expect((await patch(id, { cover: null })).status).toBe(200);

      await capture.flush();
      const line = expectDecision(capture.lines, 'item.cover', {
        outcome: 'refused',
        reason: 'unsupported_type',
      });
      expect(line).toMatchObject({ deckId: deck.id, actorId: ctx.world.owner.id });
      expect(typeof line.requestId).toBe('string');
    });

    it('refuses an unknown image and another deck asset with the same message', async () => {
      capture.lines.length = 0;
      const deck = await deckWithEditor();
      const elsewhere = await createDeck(ctx.t.db, ctx.world.owner);
      const foreign = await createAsset(ctx.t.db, elsewhere);
      const item = await json(await post(deck.id, text()));

      for (const publicId of ['gobbit/items/nope/missing', foreign.publicId]) {
        const created = await post(deck.id, text({ cover: { publicId } }));
        expect(created.status).toBe(422);
        expect(await errorPaths(created)).toEqual([['cover.publicId', 'Unknown image']]);
        const patched = await patch(item.id, { cover: { publicId } });
        expect(patched.status).toBe(422);
        expect(await errorPaths(patched)).toEqual([['cover.publicId', 'Unknown image']]);
      }

      await capture.flush();
      const unknown = expectDecision(capture.lines, 'item.cover', {
        outcome: 'refused',
        reason: 'unknown_image',
      });
      expect(unknown).toMatchObject({
        deckId: deck.id,
        itemId: item.id,
        actorId: ctx.world.owner.id,
      });
      const other = expectDecision(capture.lines, 'item.cover', {
        outcome: 'refused',
        reason: 'other_deck',
      });
      expect(other).toMatchObject({ deckId: deck.id, itemId: item.id });
      expect(other.level).toBe('warn');
    });

    it('refuses a client-sent width or height', async () => {
      const deck = await deckWithEditor();
      const asset = await createAsset(ctx.t.db, deck);
      const res = await post(
        deck.id,
        text({ cover: { publicId: asset.publicId, width: 10, height: 10 } }),
      );
      // The app's body validation answers 400 (contract says 422; see implementation-notes).
      expect(res.status).toBe(400);
    });

    it('a reader cannot PATCH a cover and a non-member gets no access (FR-002)', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      const reader = await createAccountUser(ctx.t.db);
      await ctx.sessionFor(reader);
      await addMember(ctx.t.db, deck, reader, 'reader');
      const stranger = await createAccountUser(ctx.t.db);
      await ctx.sessionFor(stranger);
      const asset = await createAsset(ctx.t.db, deck);
      const item = await createItem(ctx.t.db, deck, { card: { type: 'text', title: 'Mine' } });
      const body = { cover: { publicId: asset.publicId } };

      expect((await patch(item.id, body, reader.email)).status).toBe(403);
      const outsider = await patch(item.id, body, stranger.email);
      expect([403, 404]).toContain(outsider.status);
      const [row] = await ctx.t.db.select().from(items).where(eq(items.id, item.id));
      expect(row!.cover).toBeNull();
    });

    it('a publisher can PATCH a cover onto a proposal and publish it', async () => {
      const deck = await deckWithEditor();
      const asset = await createAsset(ctx.t.db, deck);
      const proposed = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Proposal', body: 'x' },
        status: 'proposed',
        verifiedAt: null,
        createdBy: editor.id,
      });

      const res = await patch(proposed.id, {
        cover: { publicId: asset.publicId },
        status: 'published',
      });
      expect(res.status).toBe(200);
      const dto = await json(res);
      expect(dto.status).toBe('published');
      expect(dto.cover).toMatchObject({ publicId: asset.publicId });
    });

    it('a bulk-imported item has no cover (D394)', async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner);
      const res = await ctx.app.request(`/decks/${deck.id}/imports`, {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ label: 'notes.md', rows: [text({ title: 'Imported' })] }),
      });
      expect(res.status).toBe(200);
      const rows = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.cover).toBeNull();
    });
  });
});
