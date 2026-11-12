import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestJobs, items, type DeckRow, type ItemRow, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createAsset, createDeck, createItem } from '@gobbit/db/test';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { json, setupApiTest } from './helpers';

interface Cover {
  publicId: string;
  width: number;
  height: number;
}

describe('card cover (D386)', () => {
  const ctx = setupApiTest({
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
});
