import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  categories,
  ingestJobs,
  itemEvents,
  items,
  type DeckRow,
  type IngestJobRow,
  type ItemRow,
  type UserRow,
} from '@gobbit/db';
import { addMember, createAccountUser, createAsset, createDeck, createItem } from '@gobbit/db/test';
import type { DedupVerdict } from '@gobbit/shared';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import type { IngestUploadStore } from '../src/media/ingest-uploads';
import type { StoredImage } from '../src/media/media-store';
import { json, setupApiTest } from './helpers';

class RecordingEmbedQueue implements EmbedQueue {
  readonly ids: string[] = [];
  async enqueueIfStale(itemId: string): Promise<void> {
    this.ids.push(itemId);
  }
}

class RecordingUploads implements IngestUploadStore {
  readonly deleted: string[] = [];
  async upload(): Promise<StoredImage> {
    return { publicId: 'unused', width: 1, height: 1, bytes: 1, format: 'jpg' };
  }
  async deleteForJob(jobId: string): Promise<void> {
    this.deleted.push(jobId);
  }
  llmUrl(publicId: string): string {
    return publicId;
  }
}

const NEW_VERDICT: DedupVerdict = { action: 'new', itemId: null, similarity: null, via: 'none' };

describe('review queue (D106, D107)', () => {
  const embedQueue = new RecordingEmbedQueue();
  const uploads = new RecordingUploads();
  const ctx = setupApiTest({
    search: { embedQueue },
    ingest: { enabled: true, uploads, queue: { enqueue: async () => undefined } },
  });
  let editor: UserRow;
  let deck: DeckRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(editor);
  });

  // A fresh deck per test: queues and counts stay independent.
  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, editor, 'editor');
    embedQueue.ids.length = 0;
    uploads.deleted.length = 0;
  });

  async function proposal(
    job: Partial<Pick<IngestJobRow, 'raw' | 'dedup' | 'extraction'>> = {},
    card: Record<string, unknown> = { type: 'text', title: 'Dan the Plumber', body: '050-1234567' },
    categoryIds?: string[],
  ): Promise<{ item: ItemRow; job: IngestJobRow }> {
    const item = await createItem(ctx.t.db, deck, {
      card: card as never,
      status: 'proposed',
      verifiedAt: null,
      createdBy: editor.id,
      categoryIds,
    });
    const [row] = await ctx.t.db
      .insert(ingestJobs)
      .values({
        userId: editor.id,
        deckId: deck.id,
        channel: 'pwa',
        status: 'proposed',
        raw: job.raw ?? { text: 'Dan   the plumber\n050-1234567', images: [] },
        dedup: job.dedup ?? NEW_VERDICT,
        extraction: job.extraction ?? null,
        resultItemId: item.id,
      })
      .returning();
    return { item, job: row! };
  }

  async function jobRow(id: string): Promise<IngestJobRow> {
    const [row] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id));
    return row!;
  }

  async function itemRow(id: string): Promise<ItemRow> {
    const [row] = await ctx.t.db.select().from(items).where(eq(items.id, id));
    return row!;
  }

  function post(path: string, body?: unknown, email?: string) {
    const headers = ctx.as(email);
    return ctx.app.request(path, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  describe('GET /decks/{id}/review', () => {
    it('lists proposals with job, sharer, source preview and dedup target', async () => {
      const existing = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Dan (old)', body: 'old number' },
      });
      const { item, job } = await proposal({
        dedup: { action: 'update', itemId: existing.id, similarity: 0.95, via: 'vector' },
      });

      const res = await ctx.app.request(`/decks/${deck.id}/review`, { headers: ctx.as() });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.count).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        item: { id: item.id, status: 'proposed' },
        job: {
          id: job.id,
          channel: 'pwa',
          sharedBy: { id: editor.id },
          dedup: { action: 'update', itemId: existing.id },
          newCategory: null,
          sourcePreview: 'Dan the plumber 050-1234567',
          autoPublish: null,
        },
        target: { id: existing.id, title: 'Dan (old)' },
      });
    });

    it('also resolves the deck by slug and omits published cards', async () => {
      await createItem(ctx.t.db, deck, { card: { type: 'text', title: 'Live', body: 'x' } });
      const res = await ctx.app.request(`/decks/${deck.slug}/review`, { headers: ctx.as() });
      expect((await json(res)).data).toEqual([]);
    });

    it('is forbidden for editors and hidden from non-members', async () => {
      const asEditor = await ctx.app.request(`/decks/${deck.id}/review`, {
        headers: ctx.as(editor.email),
      });
      expect(asEditor.status).toBe(403);
      const asOther = await ctx.app.request(`/decks/${deck.id}/review/count`, {
        headers: ctx.as(ctx.world.other.email),
      });
      expect(asOther.status).toBe(404);
    });
  });

  it('GET /decks/{id}/review/count counts live proposals', async () => {
    await proposal();
    const { item } = await proposal();
    await ctx.t.db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, item.id));

    const res = await ctx.app.request(`/decks/${deck.id}/review/count`, { headers: ctx.as() });
    expect(await json(res)).toEqual({ count: 1 });
  });

  describe('POST /items/{id}/publish', () => {
    it('publishes as new (no body), records the reviewer and enqueues embedding', async () => {
      const { item, job } = await proposal();
      const res = await ctx.app.request(`/items/${item.id}/publish`, {
        method: 'POST',
        headers: { Authorization: ctx.as().Authorization! },
      });
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ id: item.id, status: 'published' });

      expect((await itemRow(item.id)).verifiedAt).not.toBeNull();
      expect(await jobRow(job.id)).toMatchObject({
        status: 'published',
        reviewedBy: ctx.world.owner.id,
      });
      expect(embedQueue.ids).toEqual([item.id]);

      const again = await post(`/items/${item.id}/publish`, {});
      expect(again.status).toBe(409);
    });

    it('publishes an image proposal only for a recorded image, with its dimensions (D160)', async () => {
      const image = (publicId: string) => ({
        type: 'image',
        title: 'Receipt',
        payload: { publicId, alt: 'A receipt', width: 1, height: 1 },
      });
      const unknown = await proposal({}, image(`gobbit/ingest/${deck.id}/missing`));
      const refused = await post(`/items/${unknown.item.id}/publish`, {});
      expect(refused.status).toBe(422);
      expect((await json(refused)).errors).toEqual([
        expect.objectContaining({ path: 'payload.publicId', message: 'Unknown image' }),
      ]);

      const asset = await createAsset(ctx.t.db, deck, {
        publicId: `gobbit/ingest/${deck.id}/receipt`,
        width: 900,
        height: 1600,
      });
      const { item } = await proposal({}, image(asset.publicId));
      const res = await post(`/items/${item.id}/publish`, {});
      expect(res.status).toBe(200);
      expect((await itemRow(item.id)).payload).toMatchObject({ width: 900, height: 1600 });
    });

    it('creates the suggested category on demand and reuses it by slug', async () => {
      const first = await proposal({
        extraction: {
          model: 'm',
          escalated: false,
          type: 'text',
          confidence: 0.9,
          language: 'en',
          categoryIds: [],
          newCategory: 'Home Services',
        },
      });
      const res = await post(`/items/${first.item.id}/publish`, { createCategory: true });
      expect(res.status).toBe(200);
      const created = await ctx.t.db
        .select()
        .from(categories)
        .where(and(eq(categories.deckId, deck.id), eq(categories.slug, 'home-services')));
      expect(created).toHaveLength(1);
      expect((await json(res)).categoryIds).toContain(created[0]!.id);

      const second = await proposal({ extraction: first.job.extraction });
      expect(
        (await post(`/items/${second.item.id}/publish`, { createCategory: true })).status,
      ).toBe(200);
      const after = await ctx.t.db
        .select()
        .from(categories)
        .where(and(eq(categories.deckId, deck.id), eq(categories.slug, 'home-services')));
      expect(after).toHaveLength(1);
    });

    it('createCategory without a suggestion is a 400', async () => {
      const { item } = await proposal();
      expect((await post(`/items/${item.id}/publish`, { createCategory: true })).status).toBe(400);
    });

    it('a proposal without categories cannot be published (D95)', async () => {
      const { item, job } = await proposal({}, undefined, []);
      const res = await post(`/items/${item.id}/publish`, {});
      expect(res.status).toBe(422);
      expect((await itemRow(item.id)).status).toBe('proposed');
      expect((await jobRow(job.id)).status).toBe('proposed');
    });

    it('update mode applies the proposal to the target and removes the proposal', async () => {
      const target = await createItem(ctx.t.db, deck, {
        card: {
          type: 'link',
          title: 'Dan (old)',
          body: 'old',
          payload: { url: 'https://dan.example/' },
        },
      });
      const { item, job } = await proposal(
        { dedup: { action: 'update', itemId: target.id, similarity: null, via: 'source_url' } },
        { type: 'link', title: 'Dan (new)', body: 'new', payload: { url: 'https://dan.example/' } },
      );

      const res = await post(`/items/${item.id}/publish`, { mode: 'update' });
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ id: target.id, title: 'Dan (new)', body: 'new' });
      expect((await itemRow(item.id)).deletedAt).not.toBeNull();
      expect((await jobRow(job.id)).status).toBe('published');
      expect(embedQueue.ids).toEqual([target.id]);
    });

    it('update mode 409s when the target is no longer published (P5.9)', async () => {
      const target = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Dan (old)', body: 'old' },
      });
      const { item } = await proposal({
        dedup: { action: 'update', itemId: target.id, similarity: null, via: 'explicit' },
      });
      await ctx.t.db.update(items).set({ status: 'archived' }).where(eq(items.id, target.id));

      const list = await json(
        await ctx.app.request(`/decks/${deck.id}/review`, { headers: ctx.as() }),
      );
      expect(list.data[0].target).toBeNull();

      const res = await post(`/items/${item.id}/publish`, { mode: 'update' });
      expect(res.status).toBe(409);
      expect((await json(res)).detail).toBe(
        'The card this proposal updates is archived or deleted',
      );
      expect((await itemRow(item.id)).status).toBe('proposed');
      expect((await itemRow(target.id)).title).toBe('Dan (old)');
    });

    it('update mode without a dedup target is a 400', async () => {
      const { item } = await proposal();
      expect((await post(`/items/${item.id}/publish`, { mode: 'update' })).status).toBe(400);
    });

    it('editors cannot publish and malformed bodies are rejected', async () => {
      const { item } = await proposal();
      expect((await post(`/items/${item.id}/publish`, {}, editor.email)).status).toBe(403);
      expect((await post(`/items/${item.id}/publish`, { mode: 'merge' })).status).toBe(400);
    });
  });

  describe('POST /items/{id}/discard', () => {
    it('soft-deletes the proposal, marks the job and removes its uploads', async () => {
      const { item, job } = await proposal({
        raw: { images: [{ publicId: 'ingest/a', bytes: 10, mime: 'image/jpeg' }] },
      });
      const res = await post(`/items/${item.id}/discard`);
      expect(res.status).toBe(204);
      expect((await itemRow(item.id)).deletedAt).not.toBeNull();
      expect(await jobRow(job.id)).toMatchObject({
        status: 'discarded',
        reviewedBy: ctx.world.owner.id,
      });
      expect(uploads.deleted).toEqual([job.id]);
      expect((await post(`/items/${item.id}/discard`)).status).toBe(404);
    });

    it('refuses published cards', async () => {
      const live = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Live', body: 'x' },
      });
      expect((await post(`/items/${live.id}/discard`)).status).toBe(409);
      expect((await itemRow(live.id)).deletedAt).toBeNull();
    });
  });

  describe('GET /decks/{id}/review?source= (D191)', () => {
    it('keeps the proposals of one import', async () => {
      const imported = await proposal();
      await proposal();
      await ctx.t.db
        .update(ingestJobs)
        .set({ channel: 'import', clientLabel: 'Street notes.md' })
        .where(eq(ingestJobs.id, imported.job.id));

      const res = await ctx.app.request(
        `/decks/${deck.id}/review?source=${encodeURIComponent('Street notes.md')}`,
        { headers: ctx.as() },
      );
      const body = await json(res);
      expect(body.data.map((e: { item: { id: string } }) => e.item.id)).toEqual([imported.item.id]);
      expect(body.data[0].job).toMatchObject({ channel: 'import', clientLabel: 'Street notes.md' });
      expect(body.count).toBe(2);

      const none = await ctx.app.request(`/decks/${deck.id}/review?source=Other`, {
        headers: ctx.as(),
      });
      expect((await json(none)).data).toEqual([]);
    });
  });

  describe('POST /decks/{id}/review/publish (D191)', () => {
    it('publishes new proposals with a published event and skips the rest with a reason', async () => {
      const fresh = await proposal();
      const suggested = await proposal({
        extraction: {
          model: 'direct',
          escalated: false,
          type: 'text',
          confidence: 1,
          language: 'und',
          categoryIds: [],
          newCategory: 'Bulk Health',
        },
      });
      const existing = await createItem(ctx.t.db, deck, {
        card: { type: 'text', title: 'Dan (old)', body: 'old' },
      });
      const duplicate = await proposal({
        dedup: {
          action: 'possible_duplicate',
          itemId: existing.id,
          similarity: 0.9,
          via: 'vector',
        },
      });
      const otherDeck = await createDeck(ctx.t.db, ctx.world.owner);
      const elsewhere = await createItem(ctx.t.db, otherDeck, {
        card: { type: 'text', title: 'Elsewhere', body: 'x' },
        status: 'proposed',
      });

      const res = await post(`/decks/${deck.id}/review/publish`, {
        ids: [fresh.item.id, suggested.item.id, duplicate.item.id, existing.id, elsewhere.id],
      });

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({
        published: [fresh.item.id, suggested.item.id],
        skipped: [
          { id: duplicate.item.id, reason: 'needs-decision' },
          { id: existing.id, reason: 'already-handled' },
          { id: elsewhere.id, reason: 'already-handled' },
        ],
      });
      expect((await itemRow(fresh.item.id)).status).toBe('published');
      expect((await itemRow(duplicate.item.id)).status).toBe('proposed');
      expect(await jobRow(fresh.job.id)).toMatchObject({ status: 'published' });

      const events = await ctx.t.db
        .select()
        .from(itemEvents)
        .where(and(eq(itemEvents.deckId, deck.id), eq(itemEvents.kind, 'published')));
      expect(events.map((e) => e.itemId).sort()).toEqual([fresh.item.id, suggested.item.id].sort());

      // The suggested category was created, like the single review's default.
      const [created] = await ctx.t.db
        .select()
        .from(categories)
        .where(and(eq(categories.deckId, deck.id), eq(categories.name, 'Bulk Health')));
      expect(created).toBeDefined();
    });

    it('refuses more than 50 ids and non-publishers', async () => {
      const ids = Array.from({ length: 51 }, () => crypto.randomUUID());
      expect((await post(`/decks/${deck.id}/review/publish`, { ids })).status).toBe(400);

      const { item } = await proposal();
      const res = await post(`/decks/${deck.id}/review/publish`, { ids: [item.id] }, editor.email);
      expect(res.status).toBe(403);
      expect((await itemRow(item.id)).status).toBe('proposed');
    });
  });
});
