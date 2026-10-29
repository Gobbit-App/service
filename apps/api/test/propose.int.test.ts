import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ingestJobs, items, type DeckRow, type UserRow } from '@gobbit/db';
import {
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import { buildServices } from '../src/services';
import type { DirectDraft } from '../src/services/ingest.service';
import { setupApiTest } from './helpers';

class RecordingEmbedQueue implements EmbedQueue {
  readonly ids: string[] = [];
  async enqueueIfStale(itemId: string): Promise<void> {
    this.ids.push(itemId);
  }
}

const DRAFT: DirectDraft = {
  type: 'text',
  title: 'Dan the Plumber',
  body: '050-1234567',
  payload: {},
};

describe('ingest.proposeDirect (P5.9)', () => {
  const embedQueue = new RecordingEmbedQueue();
  const ctx = setupApiTest({ env: { INGEST_DAILY_CAP: '2' } });
  let ingest: ReturnType<typeof buildServices>['ingest'];
  let editor: UserRow;
  let deck: DeckRow;

  beforeAll(() => {
    ingest = buildServices({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      now: ctx.clock.now,
      search: { embedQueue, embedder: null },
    }).ingest;
  });

  // A fresh editor and deck per test: caps and queues stay independent.
  beforeEach(async () => {
    editor = await createAccountUser(ctx.t.db);
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, editor, 'editor');
    embedQueue.ids.length = 0;
  });

  function propose(
    extra: { targetItemId?: string; clientLabel?: string; draft?: DirectDraft } = {},
  ) {
    return ingest.proposeDirect({
      user: editor,
      deck: deck.id,
      draft: extra.draft ?? DRAFT,
      channel: 'mcp',
      targetItemId: extra.targetItemId,
      clientLabel: extra.clientLabel,
    });
  }

  async function rejection(promise: Promise<unknown>): Promise<number | undefined> {
    const err: unknown = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    return (err as { status?: number } | null)?.status;
  }

  it('creates a proposed mcp item and a proposed job with the client label', async () => {
    const result = await propose({ clientLabel: '  Claude  ' });

    const [item] = await ctx.t.db.select().from(items).where(eq(items.id, result.itemId));
    expect(item).toMatchObject({
      status: 'proposed',
      sourceKind: 'mcp',
      title: 'Dan the Plumber',
      createdBy: editor.id,
    });
    const [job] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, result.jobId));
    expect(job).toMatchObject({
      status: 'proposed',
      channel: 'mcp',
      clientLabel: 'Claude',
      resultItemId: result.itemId,
      userId: editor.id,
    });
    expect(job!.extraction).toMatchObject({ model: 'direct', confidence: 1 });
    expect(embedQueue.ids).toEqual([result.itemId]);
  });

  it('records an explicit update verdict for a target card', async () => {
    const target = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Dan (old)', body: 'old' },
    });

    const result = await propose({ targetItemId: target.id });

    expect(result.dedup).toEqual({
      action: 'update',
      itemId: target.id,
      similarity: null,
      via: 'explicit',
    });
    const [job] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, result.jobId));
    expect(job!.dedup).toEqual(result.dedup);
  });

  it('404s a target in another deck', async () => {
    const other = await createDeck(ctx.t.db, ctx.world.owner);
    const target = await createItem(ctx.t.db, other);
    expect(await rejection(propose({ targetItemId: target.id }))).toBe(404);
  });

  it('404s a target only in a private category the editor cannot see', async () => {
    const hidden = await createCategory(ctx.t.db, deck, { visibility: 'private' });
    const target = await createItem(ctx.t.db, deck, { categoryIds: [hidden.id] });
    expect(await rejection(propose({ targetItemId: target.id }))).toBe(404);
  });

  it('404s a target that is not published', async () => {
    const target = await createItem(ctx.t.db, deck, { status: 'archived' });
    expect(await rejection(propose({ targetItemId: target.id }))).toBe(404);
  });

  it('rejects card types proposals cannot have', async () => {
    const draft = { type: 'calc', title: 'Tip', body: '', payload: {} } as unknown as DirectDraft;
    expect(await rejection(propose({ draft }))).toBe(400);
  });

  it('applies the daily cap (D110)', async () => {
    await propose();
    await propose();
    expect(await rejection(propose())).toBe(429);
  });

  it('needs item.create on the deck', async () => {
    const reader = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, reader, 'reader');
    const status = await rejection(
      ingest.proposeDirect({ user: reader, deck: deck.id, draft: DRAFT, channel: 'mcp' }),
    );
    expect(status).toBe(403);
  });
});
