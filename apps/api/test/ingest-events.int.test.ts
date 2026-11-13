import { readFileSync } from 'node:fs';
import { LINK_ARTICLE_IMAGE_MIN_PX } from '@gobbit/shared';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { eventCards, ingestJobs, items, type DeckRow } from '@gobbit/db';
import { createDeck } from '@gobbit/db/test';
import { createFakeExtractor } from '../src/ai/fake-extractor';
import { buildLinkPreview } from '../src/fetch/build-preview';
import { extractPage } from '../src/fetch/extract-page';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { autoPublish } from '../src/ingest/auto-publish';
import { normalizeRaw } from '../src/ingest/normalize-raw';
import { runDedup } from '../src/ingest/run-dedup';
import { createSharerRole } from '../src/ingest/sharer-role';
import { createIngestHandler } from '../src/jobs/ingest';
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
import { createPublishProposal, reviewTransaction } from '../src/review/publish-proposal';
import { createMediaReferenceCheck } from '../src/services/media-reference';
import { setupApiTest } from './helpers';

const fixtures = new URL('../src/fetch/__fixtures__/event-pages/', import.meta.url);
const page = (file: string) => readFileSync(new URL(file, fixtures), 'utf8');

/** Each shared URL serves the fixture page named by its last path segment. */
const PAGES: Record<string, string> = {
  'https://fair.example/whats-on': page('object.html'),
  'https://fair.example/blog/plan': page('article.html'),
  'https://library.example/talk': page('no-offset.html'),
};

const fakeFetch: SafeFetch = async (url) => ({
  status: 200,
  finalUrl: url,
  ms: 3,
  html: PAGES[url] ?? '<html><head><title>Empty</title></head></html>',
  error: null,
});

/** 042 US7 (D370, D374–D376): shares recognised as events, through the real worker pipeline. */
describe('ingest events (D370, D374–D376)', () => {
  const ctx = setupApiTest();
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

  function handler() {
    const db = ctx.t.db;
    const embedQueue = { enqueueIfStale: async () => undefined };
    const jobs = createIngestJobsRepo(db);
    const decks = createDecksRepo(db);
    const roleOf = createSharerRole({
      users: createUsersRepo(db),
      decks,
      memberships: createMembershipsRepo(db),
    });
    return createIngestHandler({
      jobs,
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf,
      normalize: (raw) =>
        normalizeRaw(raw, {
          buildPreview: (url, log) =>
            buildLinkPreview(
              {
                safeFetch: fakeFetch,
                fetchJson: null,
                extract: extractPage,
                articleMinPx: LINK_ARTICLE_IMAGE_MIN_PX,
              },
              url,
              log,
            ),
          imageUrl: (id) => id,
        }),
      extraction: {
        extractor: createFakeExtractor(),
        model: 'claude-haiku-5-5',
        escalationModel: 'claude-sonnet-5-5',
        llmCalls: createLlmCallsRepo(db),
      },
      embedQueue,
      log: () => undefined,
      logger: silent,
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
      autoPublish: (input) =>
        autoPublish(
          {
            decks,
            roleOf,
            publishProposal: createPublishProposal({
              transaction: reviewTransaction(db),
              mediaReference: createMediaReferenceCheck(createAssetsRepo(db)),
              now: () => new Date(),
            }),
            jobs,
            embedQueue,
            logger: silent,
          },
          input,
        ),
      events: {
        defaultTimeZone: 'UTC',
        startMaxDays: 3650,
        locationMax: 200,
        isPersonalDeck: async (deckId) => (await decks.findById(deckId))?.kind === 'personal',
      },
    });
  }

  async function deck(autoPublishShares = false): Promise<DeckRow> {
    const created = await createDeck(ctx.t.db, ctx.world.owner, { kind: 'communal' });
    return autoPublishShares
      ? createDecksRepo(ctx.t.db).update(created.id, { autoPublishShares: true })
      : created;
  }

  async function share(d: DeckRow, url: string, timeZone?: string): Promise<string> {
    const raw = { url, images: [], ...(timeZone ? { timeZone } : {}) };
    const [job] = await ctx.t.db
      .insert(ingestJobs)
      .values({ userId: ctx.world.owner.id, deckId: d.id, channel: 'pwa', raw: raw as never })
      .returning();
    expect(await handler()(job!.id)).toBe('proposed');
    return job!.id;
  }

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0]!;
  const itemOf = async (jobId: string) => {
    const job = await jobRow(jobId);
    return (await ctx.t.db.select().from(items).where(eq(items.id, job.resultItemId!)))[0]!;
  };

  it("proposes an event page as an event card with the page's own times and place", async () => {
    const d = await deck();
    const jobId = await share(d, 'https://fair.example/whats-on', 'Europe/London');

    const item = await itemOf(jobId);
    expect(item).toMatchObject({ type: 'event', status: 'proposed' });
    expect(item.payload).toMatchObject({
      allDay: false,
      start: '2026-12-03T17:00:00.000Z',
      end: '2026-12-03T20:00:00.000Z',
      timeZone: 'Europe/London',
      location: 'Town hall, 1 High Street, Springfield',
      url: 'https://fair.example/events/winter-fair',
    });
    const [row] = await ctx.t.db.select().from(eventCards).where(eq(eventCards.itemId, item.id));
    expect(row?.timeZone).toBe('Europe/London');
    expect((await jobRow(jobId)).extraction).toMatchObject({
      type: 'event',
      event: { dateSource: 'structured', zoneSource: 'request' },
    });
  });

  it('keeps an article a link card', async () => {
    const d = await deck();
    const item = await itemOf(await share(d, 'https://fair.example/blog/plan', 'Europe/London'));
    expect(item.type).toBe('link');
  });

  it('reads a time without an offset in the fallback zone and holds it for review', async () => {
    const d = await deck(true);
    const jobId = await share(d, 'https://library.example/talk');

    const item = await itemOf(jobId);
    expect(item).toMatchObject({ type: 'event', status: 'proposed' });
    expect(item.payload).toMatchObject({ start: '2026-12-08T19:00:00.000Z', timeZone: 'UTC' });
    expect(await jobRow(jobId)).toMatchObject({
      status: 'proposed',
      autoPublish: 'held_event_unverified',
      extraction: expect.objectContaining({
        event: { dateSource: 'structured', zoneSource: 'fallback' },
      }),
    });
  });

  it("auto-publishes a structured event read in the sharer's own zone", async () => {
    const d = await deck(true);
    const jobId = await share(d, 'https://fair.example/whats-on', 'Europe/London');
    expect(await jobRow(jobId)).toMatchObject({ status: 'published', autoPublish: 'published' });
    expect((await itemOf(jobId)).status).toBe('published');
  });

  it('flags the same event shared twice as a possible duplicate by its link and date', async () => {
    const d = await deck();
    const first = await itemOf(await share(d, 'https://fair.example/whats-on', 'Europe/London'));
    const again = await share(d, 'https://fair.example/whats-on', 'Europe/London');

    expect((await jobRow(again)).dedup).toMatchObject({
      action: 'possible_duplicate',
      itemId: first.id,
      via: 'source_url',
    });
  });

  it('does not compare an event with other days or with non-event cards', async () => {
    const d = await deck();
    await share(d, 'https://fair.example/blog/plan', 'Europe/London');
    const jobId = await share(d, 'https://library.example/talk', 'Europe/London');
    expect((await jobRow(jobId)).dedup).toMatchObject({ action: 'new', via: 'none' });
  });
});
