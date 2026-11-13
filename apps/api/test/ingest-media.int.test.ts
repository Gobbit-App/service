import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assets, ingestJobs, items, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser } from '@gobbit/db/test';
import { createFakeExtractor } from '../src/ai/fake-extractor';
import { runDedup } from '../src/ingest/run-dedup';
import { createSharerRole } from '../src/ingest/sharer-role';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import { createIngestHandler } from '../src/jobs/ingest';
import type { IngestQueue } from '../src/jobs/ingest-queue';
import { MemoryIngestUploads } from '../src/media/ingest-uploads';
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
import { json, setupApiTest } from './helpers';

class RecordingQueue implements IngestQueue {
  readonly ids: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }
}

class NoopEmbedQueue implements EmbedQueue {
  async enqueueIfStale(): Promise<void> {}
}

const PDF = new TextEncoder().encode('%PDF-1.7\n% term calendar\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** 045 US5: shared PDF, audio and video files become media proposals (D395, D396, FR-027). */
describe('ingesting shared files (045)', () => {
  const queue = new RecordingQueue();
  const uploads = new MemoryIngestUploads();
  const ctx = setupApiTest({ ingest: { enabled: true, uploads, queue } });
  let editor: UserRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, editor, 'editor');
    await ctx.sessionFor(editor);
  });

  function handler() {
    const db = ctx.t.db;
    const extractor = createFakeExtractor();
    const run = createIngestHandler({
      jobs: createIngestJobsRepo(db),
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf: createSharerRole({
        users: createUsersRepo(db),
        decks: createDecksRepo(db),
        memberships: createMembershipsRepo(db),
      }),
      normalize: async () => {
        throw new Error('a file share is never fetched or normalized (D395)');
      },
      extraction: {
        extractor,
        model: 'claude-haiku-5-5',
        escalationModel: 'claude-sonnet-5-5',
        llmCalls: createLlmCallsRepo(db),
      },
      embedQueue: new NoopEmbedQueue(),
      log: () => undefined,
      dedup: (input) =>
        runDedup(
          {
            dedup: createDedupRepo(db),
            embedder: null,
            embeddings: createEmbeddingsRepo(db),
            llmCalls: createLlmCallsRepo(db),
          },
          input,
        ),
      assets: createAssetsRepo(db),
    });
    return { run, extractor };
  }

  async function share(
    files: { bytes: Uint8Array; name: string; type: string }[],
    fields: Record<string, string> = {},
  ): Promise<string> {
    const form = new FormData();
    form.set('deckId', 'family');
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    for (const f of files)
      form.append('files', new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
    const { Authorization } = ctx.as(editor.email);
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: { Authorization },
      body: form,
    });
    expect(res.status).toBe(202);
    return (await json(res)).id as string;
  }

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0]!;
  const itemRow = async (id: string) =>
    (await ctx.t.db.select().from(items).where(eq(items.id, id)))[0]!;

  it('proposes a shared PDF directly, titled from the share, with no model call', async () => {
    const id = await share([{ bytes: PDF, name: 'term.pdf', type: 'application/pdf' }], {
      text: 'Term calendar\nFor the fridge',
    });
    const job = await jobRow(id);
    expect(job.raw?.file).toMatchObject({ kind: 'pdf', pages: 3, fileName: 'term.pdf' });
    const [asset] = await ctx.t.db
      .select()
      .from(assets)
      .where(eq(assets.publicId, job.raw!.file!.publicId));
    expect(asset).toMatchObject({ kind: 'pdf', resourceType: 'image', source: 'ingest', pages: 3 });

    const { run, extractor } = handler();
    expect(await run(id)).toBe('proposed');
    expect(extractor.calls).toHaveLength(0);

    const done = await jobRow(id);
    expect(done.extraction).toMatchObject({ model: 'direct', type: 'media' });
    const item = await itemRow(done.resultItemId!);
    expect(item).toMatchObject({
      type: 'media',
      status: 'proposed',
      title: 'Term calendar',
      body: 'For the fridge',
    });
    expect(item.payload).toMatchObject({ kind: 'pdf', pages: 3, fileName: 'term.pdf' });
  });

  it('flags the same file shared again as a possible duplicate via file (D396)', async () => {
    const first = await share([{ bytes: PDF, name: 'cal.pdf', type: 'application/pdf' }], {
      title: 'Calendar',
    });
    const { run } = handler();
    await run(first);
    const firstItem = (await jobRow(first)).resultItemId;

    const again = await share([{ bytes: PDF, name: 'cal.pdf', type: 'application/pdf' }], {
      title: 'Calendar again',
    });
    await run(again);
    expect((await jobRow(again)).dedup).toMatchObject({
      action: 'possible_duplicate',
      via: 'file',
    });
    expect((await jobRow(again)).dedup?.itemId).not.toBe((await jobRow(again)).resultItemId);
    expect(firstItem).toBeTruthy();
  });

  it('reports an unsupported or extra file on the share status (FR-027)', async () => {
    const id = await share(
      [
        { bytes: new TextEncoder().encode('MZ not a pdf'), name: 'x.pdf', type: 'application/pdf' },
        { bytes: PNG, name: 'p.png', type: 'image/png' },
        { bytes: PDF, name: 'late.pdf', type: 'application/pdf' },
      ],
      { text: 'Photos' },
    );
    const job = await jobRow(id);
    expect(job.raw?.images).toHaveLength(1);
    expect(job.raw?.file).toBeUndefined();
    expect(job.raw?.unused?.map((u) => u.reason)).toEqual(['unsupported', 'extra_file']);

    const status = await ctx.app.request(`/shares/${id}`, { headers: ctx.as(editor.email) });
    expect(status.status).toBe(200);
    expect((await json(status)).preview).toMatchObject({
      photoCount: 1,
      fileKind: null,
      unusedFiles: ['unsupported', 'extra_file'],
    });
  });
});
