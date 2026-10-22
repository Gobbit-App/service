import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestJobs, itemCategories, items, llmCalls, type UserRow } from '@pb/db';
import { addMember, createAccountUser, createAsset } from '@pb/db/test';
import { ARTICLE_PAGE, INJECTION_PAGE } from '@pb/db/test/ingest-pages';
import { createFakeExtractor } from '../src/ai/fake-extractor';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { normalizeRaw } from '../src/ingest/normalize-raw';
import { createSharerRole } from '../src/ingest/sharer-role';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import { createIngestHandler, type IngestHandlerDeps } from '../src/jobs/ingest';
import { createLinkSnapshotQueue } from '../src/jobs/link-snapshot-queue';
import { QUEUES, type JobSender } from '../src/jobs/queues';
import { runDedup } from '../src/ingest/run-dedup';
import { createDedupRepo } from '../src/repositories/dedup.repo';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import type { IngestQueue } from '../src/jobs/ingest-queue';
import { createAssetsRepo } from '../src/repositories/assets.repo';
import { createCategoriesRepo } from '../src/repositories/categories.repo';
import { createDecksRepo } from '../src/repositories/decks.repo';
import { createIngestJobsRepo } from '../src/repositories/ingest-jobs.repo';
import { createItemsRepo } from '../src/repositories/items.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { createMembershipsRepo } from '../src/repositories/memberships.repo';
import { createUsersRepo } from '../src/repositories/users.repo';
import { json, setupApiTest } from './helpers';

class RecordingQueue implements IngestQueue {
  readonly ids: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }
}

class RecordingSender implements JobSender {
  readonly sent: { name: string; data: object; options?: object }[] = [];
  async send(name: string, data: object, options?: object): Promise<string | null> {
    this.sent.push({ name, data, options });
    return 'job-id';
  }
}

class RecordingEmbedQueue implements EmbedQueue {
  readonly ids: string[] = [];
  async enqueueIfStale(itemId: string): Promise<void> {
    this.ids.push(itemId);
  }
}

/** Serves fixture pages by URL instead of the network. */
const pages: Record<string, string> = {
  'https://dan.example/': ARTICLE_PAGE,
  'https://pharmacy.example/': INJECTION_PAGE,
};
const fakeFetch: SafeFetch = async (url) => ({
  status: pages[url] ? 200 : 404,
  finalUrl: url,
  ms: 3,
  html: pages[url] ?? null,
  error: pages[url] ? null : 'http_404',
});

describe('ingest pipeline (D93, D102, D105, D109, D110)', () => {
  const queue = new RecordingQueue();
  const ctx = setupApiTest({ ingest: { enabled: true, uploads: null, queue } });
  let editor: UserRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, editor, 'editor');
    await ctx.sessionFor(editor);
  });

  function handler(
    script?: unknown[],
    dedup?: IngestHandlerDeps['dedup'],
    linkSnapshotQueue?: IngestHandlerDeps['linkSnapshotQueue'],
  ) {
    const db = ctx.t.db;
    const extractor = createFakeExtractor(script ? { script } : undefined);
    const embedQueue = new RecordingEmbedQueue();
    const run = createIngestHandler({
      jobs: createIngestJobsRepo(db),
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf: createSharerRole({
        users: createUsersRepo(db),
        decks: createDecksRepo(db),
        memberships: createMembershipsRepo(db),
      }),
      normalize: (raw) => normalizeRaw(raw, { safeFetch: fakeFetch, imageUrl: (id) => id }),
      extraction: {
        extractor,
        model: 'claude-haiku-5-5',
        escalationModel: 'claude-sonnet-5-5',
        llmCalls: createLlmCallsRepo(db),
      },
      embedQueue,
      log: () => undefined,
      dedup,
      linkSnapshotQueue,
      assets: createAssetsRepo(db),
    });
    return { run, extractor, embedQueue };
  }

  async function share(body: Record<string, unknown>): Promise<string> {
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: ctx.as(editor.email),
      body: JSON.stringify({ deckId: 'family', ...body }),
    });
    expect(res.status).toBe(202);
    return (await json(res)).id as string;
  }

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0];

  it('turns a shared URL into a proposed card by the sharer', async () => {
    const jobId = await share({ url: 'https://dan.example/', text: 'our plumber' });
    const { run, embedQueue } = handler();

    expect(await run(jobId)).toBe('proposed');

    const job = await jobRow(jobId);
    expect(job).toMatchObject({ status: 'proposed', attempts: 1, error: null });
    expect(job.finishedAt).toBeInstanceOf(Date);
    expect(job.normalized?.fetch).toMatchObject({ status: 200, fallback: 'none' });
    expect(job.extraction).toMatchObject({ model: 'claude-haiku-5-5', escalated: false });

    const [item] = await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!));
    expect(item).toMatchObject({
      deckId: ctx.world.decks.family.id,
      status: 'proposed',
      type: 'link',
      title: 'Dan the Plumber',
      createdBy: editor.id,
      sourceKind: 'share',
      sourceUrl: 'https://dan.example/',
      verifiedAt: null,
    });
    expect(item.entities).toMatchObject({ phones: ['050-123-4567'] });
    const cats = await ctx.t.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.itemId, item.id));
    expect(cats).toHaveLength(1);
    expect(embedQueue.ids).toEqual([item.id]);

    const calls = await ctx.t.db.select().from(llmCalls).where(eq(llmCalls.jobId, jobId));
    expect(calls).toEqual([
      expect.objectContaining({ purpose: 'extract', status: 'ok', userId: editor.id }),
    ]);

    // D109: the debug view shows the whole pipeline.
    const res = await ctx.app.request(`/ingest/${jobId}`, { headers: ctx.as(editor.email) });
    const view = await json(res);
    expect(view).toMatchObject({ status: 'proposed', resultItemId: item.id });
    expect(view.normalized.text).toContain('050-123-4567');
  });

  it('keeps the page preview on a shared link and asks for its image copy (D163)', async () => {
    const jobId = await share({ url: 'https://dan.example/' });
    const sender = new RecordingSender();
    const { run } = handler(
      undefined,
      undefined,
      createLinkSnapshotQueue({ sender, log: () => {} }),
    );

    expect(await run(jobId)).toBe('proposed');

    const job = await jobRow(jobId);
    const [item] = await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!));
    expect(item.payload).toMatchObject({
      url: 'https://dan.example/',
      preview: { title: 'Dan the Plumber', image: 'https://cdn.example.com/dan.jpg' },
    });
    expect(sender.sent).toEqual([
      {
        name: QUEUES.linkSnapshot,
        data: { itemId: item.id },
        options: expect.objectContaining({ singletonKey: item.id }),
      },
    ]);
  });

  describe('locked social hosts (D167)', () => {
    const post = 'https://www.instagram.com/p/abc/';

    async function lockedJob(raw: Record<string, unknown>) {
      const [job] = await ctx.t.db
        .insert(ingestJobs)
        .values({
          userId: editor.id,
          deckId: ctx.world.decks.family.id,
          channel: 'shortcut',
          raw: { url: post, images: [], ...raw },
        })
        .returning();
      return job!.id;
    }

    async function resultItem(jobId: string) {
      const job = await jobRow(jobId);
      expect(job.status).toBe('proposed');
      return (await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!)))[0]!;
    }

    it('makes a link with the caption and the shared image as its stored copy', async () => {
      const asset = await createAsset(ctx.t.db, ctx.world.decks.family, {
        publicId: `gobbit/ingest/${ctx.world.decks.family.id}/post`,
        source: 'ingest',
        width: 1080,
        height: 1350,
      });
      const jobId = await lockedJob({
        text: `Dan fixed our sink in an hour ${post}`,
        images: [{ publicId: asset.publicId, bytes: 1024, mime: 'image/jpeg' }],
      });
      const sender = new RecordingSender();
      const { run } = handler(
        undefined,
        undefined,
        createLinkSnapshotQueue({ sender, log: () => {} }),
      );

      expect(await run(jobId)).toBe('proposed');
      const item = await resultItem(jobId);
      expect(item.type).toBe('link');
      expect(item.payload).toEqual({
        url: post,
        preview: {
          title: item.title,
          description: 'Dan fixed our sink in an hour',
          publicId: asset.publicId,
          width: 1080,
          height: 1350,
        },
      });
      // The shared image is already stored: nothing to copy.
      expect(sender.sent).toEqual([]);
    });

    it('keeps only the caption for a text-only share', async () => {
      const jobId = await lockedJob({ text: 'Best hummus in town' });
      const { run } = handler();

      expect(await run(jobId)).toBe('proposed');
      const item = await resultItem(jobId);
      expect(item.payload).toEqual({
        url: post,
        preview: { title: item.title, description: 'Best hummus in town' },
      });
    });
  });

  it('skips a job that already finished (re-delivered message)', async () => {
    const jobId = await share({ text: 'Plumber 050-1234567' });
    const { run } = handler();
    expect(await run(jobId)).toBe('proposed');
    expect(await run(jobId)).toBe('skipped');
  });

  it('fails the job after invalid output twice, with no card', async () => {
    const jobId = await share({ text: 'Something to remember' });
    const { run, extractor } = handler([{ title: 1 }, { body: null }]);

    expect(await run(jobId)).toBe('failed');
    expect(extractor.calls).toHaveLength(2);
    const job = await jobRow(jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/^invalid_output: /);
    expect(job.resultItemId).toBeNull();
  });

  it('escalates a low-confidence proposal and records both calls', async () => {
    const jobId = await share({ text: 'Café Noa shakshuka, Dizengoff 99' });
    const proposal = (confidence: number) => ({
      type: 'text',
      title: 'Café Noa',
      body: 'Shakshuka at Dizengoff 99',
      categoryIds: [],
      language: 'en',
      confidence,
    });
    const { run } = handler([proposal(0.4), proposal(0.85)]);

    expect(await run(jobId)).toBe('proposed');
    const job = await jobRow(jobId);
    expect(job.extraction).toMatchObject({ model: 'claude-sonnet-5-5', escalated: true });
    // No category fitted: the default category keeps the proposal visible.
    expect(job.extraction?.categoryIds).toHaveLength(1);
    const calls = await ctx.t.db.select().from(llmCalls).where(eq(llmCalls.jobId, jobId));
    expect(calls.map((c) => c.purpose).sort()).toEqual(['extract', 'extract_escalated']);
  });

  it('keeps injected instructions as data: the real title wins and no category is invented', async () => {
    const jobId = await share({ url: 'https://pharmacy.example/' });
    const { run, extractor } = handler();

    expect(await run(jobId)).toBe('proposed');
    const prompt = extractor.calls[0]!.input;
    expect(prompt.source.text).toContain('IGNORE PREVIOUS INSTRUCTIONS');

    const job = await jobRow(jobId);
    const [item] = await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!));
    expect(item.title).toBe('Neighbourhood Pharmacy Opening Hours');
    expect(job.extraction?.newCategory).toBeNull();
  });

  it('fails when the sharer is no longer a member of the deck', async () => {
    const leaver = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, leaver, 'editor');
    const [job] = await ctx.t.db
      .insert(ingestJobs)
      .values({
        userId: leaver.id,
        deckId: ctx.world.decks.scratch.id,
        channel: 'paste',
        raw: { text: 'hello', images: [] },
      })
      .returning();
    const { run } = handler();

    expect(await run(job!.id)).toBe('failed');
    expect((await jobRow(job!.id)).error).toBe('sharer_not_member');
  });

  const keylessDedup: IngestHandlerDeps['dedup'] = (input) =>
    runDedup(
      {
        dedup: createDedupRepo(ctx.t.db),
        embedder: null,
        embeddings: createEmbeddingsRepo(ctx.t.db),
        llmCalls: createLlmCallsRepo(ctx.t.db),
      },
      input,
    );

  it('records the dedup verdict: the same URL shared twice is an update of the first card', async () => {
    const first = await share({ url: 'https://dan.example/?utm_source=wa' });
    const second = await share({ url: 'https://dan.example/' });
    const { run } = handler(undefined, keylessDedup);

    expect(await run(first)).toBe('proposed');
    expect(await run(second)).toBe('proposed');
    const firstJob = await jobRow(first);
    expect((await jobRow(second)).dedup).toMatchObject({
      action: 'update',
      via: 'source_url',
    });
    expect((await jobRow(second)).dedup?.itemId).not.toBe((await jobRow(second)).resultItemId);
    expect(firstJob.dedup).not.toBeNull();
  });

  it('a dedup error still proposes the card, with no verdict', async () => {
    const jobId = await share({ text: 'Bakery opens at 7' });
    const { run } = handler(undefined, async () => {
      throw new Error('db hiccup');
    });

    expect(await run(jobId)).toBe('proposed');
    expect(await jobRow(jobId)).toMatchObject({ status: 'proposed', dedup: null });
  });
});
