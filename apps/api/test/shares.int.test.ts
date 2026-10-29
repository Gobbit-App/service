import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ingestJobs, items, memberships, type IngestJobRow, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createItem } from '@gobbit/db/test';
import { SHARES_LIST_LIMIT, type IngestChannel } from '@gobbit/shared';
import type { IngestQueue } from '../src/jobs/ingest-queue';
import { MemoryIngestUploads } from '../src/media/ingest-uploads';
import { json, setupApiTest } from './helpers';

class RecordingQueue implements IngestQueue {
  readonly ids: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP = 8;
const SECRET_TEXT = 'gate code 4411, do not share';

describe('Your shares: GET /decks/{id}/shares, GET /shares/{id}, POST /shares/{id}/retry (D196, D197)', () => {
  const queue = new RecordingQueue();
  const ctx = setupApiTest({
    env: { INGEST_DAILY_CAP: String(DAILY_CAP) },
    ingest: { enabled: true, uploads: new MemoryIngestUploads(), queue },
  });

  let sharer: UserRow;
  let peer: UserRow;
  let busy: UserRow;
  let retrier: UserRow;
  let reader: UserRow;
  let capped: UserRow;
  let leaver: UserRow;
  let stranger: UserRow;

  beforeAll(async () => {
    const { family } = ctx.world.decks;
    [sharer, peer, busy, retrier, reader, capped, leaver, stranger] = await Promise.all(
      Array.from({ length: 8 }, () => createAccountUser(ctx.t.db)),
    );
    for (const u of [sharer, peer, busy, retrier, capped, leaver]) {
      await addMember(ctx.t.db, family, u, 'editor');
    }
    await addMember(ctx.t.db, family, reader, 'reader');
    for (const u of [sharer, peer, busy, retrier, reader, capped, leaver, stranger]) {
      await ctx.sessionFor(u);
    }
  });

  async function insertJob(
    user: UserRow,
    overrides: Partial<typeof ingestJobs.$inferInsert> = {},
  ): Promise<IngestJobRow> {
    const [row] = await ctx.t.db
      .insert(ingestJobs)
      .values({
        userId: user.id,
        deckId: ctx.world.decks.family.id,
        channel: 'paste' as IngestChannel,
        status: 'queued',
        raw: { text: SECRET_TEXT, url: 'https://dentist.example/about', images: [] },
        createdAt: ctx.clock.now(),
        ...overrides,
      })
      .returning();
    return row!;
  }

  const failed = (user: UserRow, overrides: Partial<typeof ingestJobs.$inferInsert> = {}) =>
    insertJob(user, {
      status: 'failed',
      failureCode: 'assistant_unavailable',
      error: 'error: provider 502 while fetching https://dentist.example/about',
      ...overrides,
    });

  const list = (user: UserRow, deck = 'family') =>
    ctx.app.request(`/decks/${deck}/shares`, { headers: ctx.as(user.email) });
  const getOne = (user: UserRow, id: string) =>
    ctx.app.request(`/shares/${id}`, { headers: ctx.as(user.email) });
  const retry = (user: UserRow, id: string) =>
    ctx.app.request(`/shares/${id}/retry`, { method: 'POST', headers: ctx.as(user.email) });

  describe('list', () => {
    it("returns only the caller's share channels in the last 30 days, newest first", async () => {
      const now = ctx.clock.now().getTime();
      const older = await insertJob(sharer, { createdAt: new Date(now - 2 * DAY_MS) });
      const newer = await insertJob(sharer, { channel: 'pwa', createdAt: new Date(now - 1000) });
      await insertJob(sharer, { createdAt: new Date(now - 31 * DAY_MS) });
      await insertJob(sharer, { channel: 'mcp', clientLabel: 'Claude' });
      await insertJob(sharer, { channel: 'import' });
      await insertJob(peer);

      const res = await list(sharer);
      expect(res.status).toBe(200);
      const { shares } = await json(res);
      expect(shares.map((s: { id: string }) => s.id)).toEqual([newer.id, older.id]);
    });

    it(`returns at most ${SHARES_LIST_LIMIT}`, async () => {
      const now = ctx.clock.now().getTime();
      for (let i = 0; i < SHARES_LIST_LIMIT + 3; i++) {
        await insertJob(busy, { createdAt: new Date(now - i * 1000) });
      }
      const { shares } = await json(await list(busy));
      expect(shares).toHaveLength(SHARES_LIST_LIMIT);
    });

    it('answers an empty list, and 404 for a deck the caller cannot see', async () => {
      expect(await json(await list(reader))).toEqual({ shares: [] });
      expect((await list(stranger)).status).toBe(404);
    });
  });

  describe('access', () => {
    it("404s another member's share, the deck publisher's included", async () => {
      const job = await insertJob(sharer);
      expect((await getOne(peer, job.id)).status).toBe(404);
      expect(
        (
          await ctx.app.request(`/shares/${job.id}`, { headers: ctx.as() })
        ) // the deck owner
        .status,
      ).toBe(404);
    });

    it('404s a non-member, a removed member and a malformed id', async () => {
      const job = await insertJob(leaver);
      await ctx.t.db
        .delete(memberships)
        .where(
          and(eq(memberships.userId, leaver.id), eq(memberships.deckId, ctx.world.decks.family.id)),
        );
      expect((await getOne(leaver, job.id)).status).toBe(404);
      expect((await retry(leaver, job.id)).status).toBe(404);
      expect((await getOne(stranger, job.id)).status).toBe(404);
      expect((await getOne(sharer, 'not-a-uuid')).status).toBe(404);
    });

    it('refuses an ingest token (ADR-046)', async () => {
      const job = await insertJob(sharer);
      const res = await ctx.app.request(`/shares/${job.id}`, {
        headers: { Authorization: `Bearer ing_${'A'.repeat(43)}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('summary', () => {
    it.each([
      ['queued', 'processing'],
      ['running', 'processing'],
      ['proposed', 'in_review'],
      ['discarded', 'not_added'],
    ] as const)('maps %s to %s', async (status, state) => {
      const job = await insertJob(sharer, { status });
      expect((await json(await getOne(sharer, job.id))).state).toBe(state);
    });

    it('links a published card and marks it deleted once soft-deleted', async () => {
      const card = await createItem(ctx.t.db, ctx.world.decks.family, {
        card: { type: 'text', title: 'Dentist', payload: {} },
        createdBy: sharer.id,
      });
      const job = await insertJob(sharer, {
        status: 'published',
        resultItemId: card.id,
        reviewedBy: ctx.world.owner.id,
        reviewedAt: ctx.clock.now(),
      });

      const live = await json(await getOne(sharer, job.id));
      expect(live).toMatchObject({
        state: 'published',
        item: { id: card.id, title: 'Dentist', deleted: false },
        preview: { title: 'Dentist', host: 'dentist.example', photoCount: 0 },
        reviewedBy: { displayName: ctx.world.owner.displayName },
      });

      await ctx.t.db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, card.id));
      expect((await json(await getOne(sharer, job.id))).item.deleted).toBe(true);
    });

    it('shows a failed share with its code and never the stored error or shared text', async () => {
      const job = await failed(sharer);
      const res = await getOne(sharer, job.id);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({
        state: 'failed',
        failureCode: 'assistant_unavailable',
        canRetry: true,
      });
      expect(text).not.toContain(SECRET_TEXT);
      expect(text).not.toContain('provider 502');
      expect(JSON.parse(text)).not.toHaveProperty('raw');
      expect(JSON.parse(text)).not.toHaveProperty('error');
    });
  });

  describe('retry', () => {
    it('queues a failed share again (202) and refuses a second tap (409)', async () => {
      const job = await failed(retrier);
      const res = await retry(retrier, job.id);
      expect(res.status).toBe(202);
      expect(await json(res)).toMatchObject({ id: job.id, state: 'processing', failureCode: null });
      expect(queue.ids).toContain(job.id);

      const [row] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, job.id));
      expect(row).toMatchObject({ status: 'queued', retryCount: 1, failureCode: null });
      expect(row!.retriedAt).toBeInstanceOf(Date);

      const again = await retry(retrier, job.id);
      expect(again.status).toBe(409);
      expect((await json(again)).type).toContain('/problems/share-not-failed');
    });

    it('410s once the stored copy is gone', async () => {
      const job = await failed(retrier, { raw: null, failureCode: 'content_expired' });
      const res = await retry(retrier, job.id);
      expect(res.status).toBe(410);
      expect((await json(res)).type).toContain('/problems/share-expired');
    });

    it('422s after three retries', async () => {
      const job = await failed(retrier, { retryCount: 3 });
      const res = await retry(retrier, job.id);
      expect(res.status).toBe(422);
      expect((await json(res)).type).toContain('/problems/share-retry-limit');
    });

    it('403s a member who can no longer add cards', async () => {
      const job = await failed(reader);
      expect((await retry(reader, job.id)).status).toBe(403);
    });

    it('429s when the daily cap is reached', async () => {
      const job = await failed(capped, {
        createdAt: new Date(ctx.clock.now().getTime() - 2 * DAY_MS),
      });
      for (let i = 0; i < DAILY_CAP; i++) await insertJob(capped, { status: 'proposed' });
      const res = await retry(capped, job.id);
      expect(res.status).toBe(429);
      const [row] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, job.id));
      expect(row!.status).toBe('failed');
    });
  });
});
