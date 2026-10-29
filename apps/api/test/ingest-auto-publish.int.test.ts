import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ingestJobs, itemEvents, items, memberships, type DeckRow, type UserRow } from '@gobbit/db';
import type { IngestChannel } from '@gobbit/shared';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import { ARTICLE_PAGE } from '@gobbit/db/test/ingest-pages';
import { createFakeExtractor } from '../src/ai/fake-extractor';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { autoPublish } from '../src/ingest/auto-publish';
import { normalizeRaw } from '../src/ingest/normalize-raw';
import { runDedup } from '../src/ingest/run-dedup';
import { createSharerRole } from '../src/ingest/sharer-role';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import { createIngestHandler, type IngestHandlerDeps } from '../src/jobs/ingest';
import { createPublishProposal, reviewTransaction } from '../src/review/publish-proposal';
import { createAssetsRepo } from '../src/repositories/assets.repo';
import { createCategoriesRepo } from '../src/repositories/categories.repo';
import { createDecksRepo } from '../src/repositories/decks.repo';
import { createDedupRepo } from '../src/repositories/dedup.repo';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import { createIngestJobsRepo } from '../src/repositories/ingest-jobs.repo';
import { createItemsRepo } from '../src/repositories/items.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { createMembershipsRepo } from '../src/repositories/memberships.repo';
import { createUsersRepo } from '../src/repositories/users.repo';
import { createImageReferenceCheck } from '../src/services/image-reference';
import { setupApiTest } from './helpers';

class RecordingEmbedQueue implements EmbedQueue {
  readonly ids: string[] = [];
  async enqueueIfStale(itemId: string): Promise<void> {
    this.ids.push(itemId);
  }
}

const fakeFetch: SafeFetch = async (url) => ({
  status: 200,
  finalUrl: url,
  ms: 3,
  html: ARTICLE_PAGE,
  error: null,
});

/** D192/D193: a publisher's share on an opted-in deck is published by the worker, as the sharer. */
describe('ingest auto-publish (D193)', () => {
  const ctx = setupApiTest();
  const silent = { warn: () => undefined, error: () => undefined };

  function handler(opts: { script?: unknown[]; dedup?: IngestHandlerDeps['dedup'] | null } = {}) {
    const db = ctx.t.db;
    const embedQueue = new RecordingEmbedQueue();
    const jobs = createIngestJobsRepo(db);
    const decks = createDecksRepo(db);
    const roleOf = createSharerRole({
      users: createUsersRepo(db),
      decks,
      memberships: createMembershipsRepo(db),
    });
    const dedup: IngestHandlerDeps['dedup'] =
      opts.dedup === null
        ? undefined
        : (opts.dedup ??
          ((input) =>
            runDedup(
              {
                dedup: createDedupRepo(db),
                embedder: null,
                embeddings: createEmbeddingsRepo(db),
                llmCalls: createLlmCallsRepo(db),
              },
              input,
            )));
    const run = createIngestHandler({
      jobs,
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf,
      normalize: (raw) => normalizeRaw(raw, { safeFetch: fakeFetch, imageUrl: (id) => id }),
      extraction: {
        extractor: createFakeExtractor(opts.script ? { script: opts.script } : undefined),
        model: 'claude-haiku-5-5',
        escalationModel: 'claude-sonnet-5-5',
        llmCalls: createLlmCallsRepo(db),
      },
      embedQueue,
      log: () => undefined,
      logger: silent,
      dedup,
      assets: createAssetsRepo(db),
      autoPublish: (input) =>
        autoPublish(
          {
            decks,
            roleOf,
            publishProposal: createPublishProposal({
              transaction: reviewTransaction(db),
              imageReference: createImageReferenceCheck(createAssetsRepo(db)),
              now: () => new Date(),
            }),
            jobs,
            embedQueue,
            logger: silent,
          },
          input,
        ),
    });
    return { run, embedQueue };
  }

  async function deckWith(autoPublishShares: boolean): Promise<DeckRow> {
    const deck = await createDeck(ctx.t.db, ctx.world.owner, { kind: 'communal' });
    return createDecksRepo(ctx.t.db).update(deck.id, { autoPublishShares });
  }

  async function shareJob(
    deck: DeckRow,
    user: UserRow,
    raw: Record<string, unknown> = { text: 'Bakery opens at 7', images: [] },
    channel: IngestChannel = 'paste',
  ): Promise<string> {
    const [job] = await ctx.t.db
      .insert(ingestJobs)
      .values({ userId: user.id, deckId: deck.id, channel, raw: raw as never })
      .returning();
    return job!.id;
  }

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0]!;
  const itemOf = async (jobId: string) => {
    const job = await jobRow(jobId);
    return (await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!)))[0]!;
  };

  async function member(deck: DeckRow, role: 'maintainer' | 'editor'): Promise<UserRow> {
    const user = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, user, role);
    return user;
  }

  it("publishes the owner's share as the sharer, via ingest", async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, ctx.world.owner);
    const { run, embedQueue } = handler();

    expect(await run(jobId)).toBe('proposed');

    const job = await jobRow(jobId);
    expect(job).toMatchObject({
      status: 'published',
      autoPublish: 'published',
      reviewedBy: ctx.world.owner.id,
    });
    expect(job.reviewedAt).toBeInstanceOf(Date);
    const item = await itemOf(jobId);
    expect(item.status).toBe('published');
    expect(item.verifiedAt).toBeInstanceOf(Date);
    const events = await ctx.t.db
      .select()
      .from(itemEvents)
      .where(and(eq(itemEvents.itemId, item.id), eq(itemEvents.kind, 'published')));
    expect(events).toEqual([
      expect.objectContaining({ via: 'ingest', actorUserId: ctx.world.owner.id }),
    ]);
    expect(embedQueue.ids).toContain(item.id);
  });

  it('a maintainer may publish directly too', async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, await member(deck, 'maintainer'));
    const { run } = handler();

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({ status: 'published', autoPublish: 'published' });
  });

  it("holds an editor's share for review (D96 unchanged)", async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, await member(deck, 'editor'));
    const { run } = handler();

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_not_publisher',
      reviewedBy: null,
    });
    expect((await itemOf(jobId)).status).toBe('proposed');
  });

  it('uses the role at processing time: a demoted sharer is held', async () => {
    const deck = await deckWith(true);
    const sharer = await member(deck, 'maintainer');
    const jobId = await shareJob(deck, sharer);
    await ctx.t.db
      .update(memberships)
      .set({ role: 'editor' })
      .where(and(eq(memberships.deckId, deck.id), eq(memberships.userId, sharer.id)));
    const { run } = handler();

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_not_publisher',
    });
  });

  it('holds a likely duplicate', async () => {
    const deck = await deckWith(true);
    const first = await shareJob(deck, ctx.world.owner, {
      url: 'https://dan.example/',
      images: [],
    });
    const second = await shareJob(deck, ctx.world.owner, {
      url: 'https://dan.example/?utm_source=wa',
      images: [],
    });
    const { run } = handler();

    await run(first);
    await run(second);
    expect((await jobRow(first)).autoPublish).toBe('published');
    expect(await jobRow(second)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_duplicate',
    });
  });

  it('holds a share when the duplicate check failed', async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, ctx.world.owner);
    const { run } = handler({
      dedup: async () => {
        throw new Error('db hiccup');
      },
    });

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_duplicate_check_failed',
    });
  });

  it('holds a share the assistant could not place in a category', async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, ctx.world.owner);
    const { run } = handler({
      script: [
        {
          type: 'text',
          title: 'Bakery hours',
          body: 'Bakery opens at 7',
          categoryIds: [],
          newCategory: null,
          language: 'en',
          confidence: 0.9,
        },
      ],
    });

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_needs_category',
    });
  });

  it('records nothing with the setting off', async () => {
    const deck = await deckWith(false);
    const jobId = await shareJob(deck, ctx.world.owner);
    const { run } = handler();

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({ status: 'proposed', autoPublish: null });
  });

  it('leaves MCP proposals to review', async () => {
    const deck = await deckWith(true);
    const jobId = await shareJob(deck, ctx.world.owner, undefined, 'mcp');
    const { run } = handler();

    await run(jobId);
    expect(await jobRow(jobId)).toMatchObject({ status: 'proposed', autoPublish: null });
  });
});
