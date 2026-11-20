import { LINK_ARTICLE_IMAGE_MIN_PX, type IngestChannel, type IngestRaw } from '@gobbit/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import {
  categories,
  ingestJobs,
  itemCategories,
  items,
  llmCalls,
  users,
  type Db,
  type UserRow,
} from '@gobbit/db';
import { addMember, createAccountUser, createAsset } from '@gobbit/db/test';
import { ARTICLE_PAGE } from '@gobbit/db/test/ingest-pages';
import { createPlatformAdmins } from '../src/access/platform-admin';
import { createFakeExtractor } from '../src/ai/fake-extractor';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { normalizeRaw } from '../src/ingest/normalize-raw';
import { buildLinkPreview } from '../src/fetch/build-preview';
import { extractPage } from '../src/fetch/extract-page';
import { createSharerRole } from '../src/ingest/sharer-role';
import type { EmbedQueue } from '../src/jobs/embed-queue';
import { createIngestHandler } from '../src/jobs/ingest';
import { runDedup } from '../src/ingest/run-dedup';
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

class RecordingEmbedQueue implements EmbedQueue {
  readonly ids: string[] = [];
  async enqueueIfStale(itemId: string): Promise<void> {
    this.ids.push(itemId);
  }
}

const PAGE = 'https://dan.example/';
const fakeFetch: SafeFetch = async (url) => ({
  status: url === PAGE ? 200 : 404,
  finalUrl: url,
  ms: 3,
  html: url === PAGE ? ARTICLE_PAGE : null,
  error: url === PAGE ? null : 'http_404',
});

function buildHandler(db: Db, smartShare: (userId: string) => Promise<boolean>) {
  const usersRepo = createUsersRepo(db);
  const extractor = createFakeExtractor();
  const embedQueue = new RecordingEmbedQueue();
  const run = createIngestHandler({
    smartShare,
    jobs: createIngestJobsRepo(db),
    categories: createCategoriesRepo(db),
    items: createItemsRepo(db),
    roleOf: createSharerRole({
      users: usersRepo,
      decks: createDecksRepo(db),
      memberships: createMembershipsRepo(db),
    }),
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
      extractor,
      model: 'claude-haiku-5-5',
      escalationModel: 'claude-sonnet-5-5',
      llmCalls: createLlmCallsRepo(db),
    },
    embedQueue,
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
  return { run, extractor, embedQueue };
}

/** 050 US1 (FR-001, FR-005, FR-007, FR-011): smart share off means no model call and a card as sent. */
describe('ingest spend guard: smart share off (050)', () => {
  const ctx = setupApiTest({ ingest: { enabled: true, uploads: null } });
  let sharer: UserRow;

  beforeAll(async () => {
    sharer = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, sharer, 'editor');
    // The switch is off by default; assert it so the test reads the real column.
    const [row] = await ctx.t.db.select().from(users).where(eq(users.id, sharer.id));
    expect(row!.smartShare).toBe(false);
  });

  function handler() {
    const usersRepo = createUsersRepo(ctx.t.db);
    // As worker.ts binds it (minus the platform-admin allowance, which the sharer is not).
    return buildHandler(
      ctx.t.db,
      async (id) => (await usersRepo.smartShareOf(id))?.smartShare ?? false,
    );
  }

  async function photos(n: number) {
    const rows = await Promise.all(
      Array.from({ length: n }, () =>
        createAsset(ctx.t.db, ctx.world.decks.family, { source: 'ingest' }),
      ),
    );
    return rows.map((a) => ({ publicId: a.publicId, bytes: 1024, mime: 'image/jpeg' }));
  }

  async function job(channel: IngestChannel, raw: Partial<IngestRaw>) {
    const [row] = await ctx.t.db
      .insert(ingestJobs)
      .values({
        userId: sharer.id,
        deckId: ctx.world.decks.family.id,
        channel,
        raw: { images: [], ...raw },
      })
      .returning();
    return row!.id;
  }

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0]!;

  /** Runs the job and returns its single proposed card, after the guard's shared checks. */
  async function runProposed(jobId: string) {
    const { run, extractor, embedQueue } = handler();
    expect(await run(jobId)).toBe('proposed');

    expect(extractor.calls).toHaveLength(0);
    const calls = await ctx.t.db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.jobId, jobId), like(llmCalls.purpose, 'extract%')));
    expect(calls).toHaveLength(0);

    const saved = await jobRow(jobId);
    const [item] = await ctx.t.db.select().from(items).where(eq(items.id, saved.resultItemId!));
    expect(item!.status).toBe('proposed');
    expect(embedQueue.ids).toEqual([item!.id]); // FR-011
    expect(saved.dedup).not.toBeNull(); // FR-007

    const cats = await ctx.t.db
      .select({ isDefault: categories.isDefault })
      .from(itemCategories)
      .innerJoin(categories, eq(categories.id, itemCategories.categoryId))
      .where(eq(itemCategories.itemId, item!.id));
    expect(cats).toEqual([{ isDefault: true }]);
    return { item: item!, saved };
  }

  describe.each(['paste', 'pwa', 'shortcut'] as const)('channel %s', (channel) => {
    it('saves a link as sent: page title, the sender text without the address', async () => {
      const { item } = await runProposed(
        await job(channel, { url: PAGE, text: `our plumber ${PAGE}` }),
      );
      expect(item).toMatchObject({ type: 'link', title: 'Dan the Plumber', sourceUrl: PAGE });
      expect(item.body).toBe('our plumber');
    });

    it('saves a text: first line as title, the rest as body', async () => {
      const { item } = await runProposed(
        await job(channel, { text: 'Bakery hours\nOpens at 7, closed Mondays' }),
      );
      expect(item).toMatchObject({
        type: 'text',
        title: 'Bakery hours',
        body: 'Opens at 7, closed Mondays',
      });
    });

    it('saves two photos as one image card', async () => {
      const images = await photos(2);
      const { item } = await runProposed(await job(channel, { images }));
      expect(item).toMatchObject({ type: 'media', title: 'Shared image' });
      expect(item.payload).toMatchObject({
        kind: 'image',
        images: images.map((i) => expect.objectContaining({ publicId: i.publicId })),
      });
    });
  });

  describe('email', () => {
    it('saves a body with a signature link as text, subject as title', async () => {
      const { item } = await runProposed(
        await job('email', {
          title: 'Garden plans',
          text: 'Meet at the garden Sunday.\n--\nDan https://dan.example/',
        }),
      );
      expect(item).toMatchObject({
        type: 'text',
        title: 'Garden plans',
        body: 'Meet at the garden Sunday.\n--\nDan https://dan.example/',
      });
    });

    it('saves photo attachments as an image card titled by the subject', async () => {
      const { item } = await runProposed(
        await job('email', {
          title: 'Trip photos',
          text: 'From the lake',
          images: await photos(2),
        }),
      );
      expect(item).toMatchObject({
        type: 'media',
        title: 'Trip photos',
        body: 'From the lake',
      });
    });
  });

  it('a link share with photos leaves the photos unreferenced (they fall to media-sweep)', async () => {
    const images = await photos(2);
    const { item } = await runProposed(
      await job('pwa', { url: PAGE, text: `our plumber ${PAGE}`, images }),
    );
    expect(item.type).toBe('link');
    const held = await ctx.t.db
      .select({ payload: items.payload, cover: items.cover })
      .from(items)
      .where(eq(items.deckId, ctx.world.decks.family.id));
    const stored = JSON.stringify(held);
    for (const { publicId } of images) expect(stored).not.toContain(publicId);
  });

  it('proposes a PDF share as today, with no model call (FR-005)', async () => {
    const pdf = await createAsset(ctx.t.db, ctx.world.decks.family, {
      kind: 'pdf',
      source: 'ingest',
    });
    const { item } = await runProposed(
      await job('pwa', {
        file: {
          publicId: pdf.publicId,
          kind: 'pdf',
          bytes: 1024,
          mime: 'application/pdf',
          pages: 3,
          fileName: 'school-menu.pdf',
        },
      }),
    );
    expect(item).toMatchObject({ type: 'media', title: 'school-menu' });
    expect(item.payload).toMatchObject({ kind: 'pdf', publicId: pdf.publicId });
  });
});

/** 050 US3 (FR-002, FR-003): the switch is read per share; only the database writes it. */
describe('ingest spend guard: smart share on (050)', () => {
  const ADMIN_EMAIL = 'spend-admin@example.test';
  const ctx = setupApiTest({ ingest: { enabled: true, uploads: null } });
  let member: UserRow;
  let admin: UserRow;

  beforeAll(async () => {
    member = await createAccountUser(ctx.t.db);
    admin = await createAccountUser(ctx.t.db, { email: ADMIN_EMAIL });
    for (const u of [member, admin]) {
      await addMember(ctx.t.db, ctx.world.decks.family, u, 'editor');
      await ctx.sessionFor(u);
    }
  });

  // Replicates the worker.ts binding: the column, or a platform admin.
  function handler() {
    const usersRepo = createUsersRepo(ctx.t.db);
    const admins = createPlatformAdmins({ admins: [ADMIN_EMAIL] });
    return buildHandler(ctx.t.db, async (userId) => {
      const u = await usersRepo.smartShareOf(userId);
      return u !== null && (u.smartShare || admins.is({ email: u.email }));
    });
  }

  const setSmartShare = (u: UserRow, on: boolean) =>
    ctx.t.db.update(users).set({ smartShare: on }).where(eq(users.id, u.id));

  /** Runs one text share for the user; returns how many extract calls the model saw. */
  async function share(u: UserRow): Promise<{ modelCalls: number; llmRows: number }> {
    const [row] = await ctx.t.db
      .insert(ingestJobs)
      .values({
        userId: u.id,
        deckId: ctx.world.decks.family.id,
        channel: 'pwa',
        raw: { images: [], text: 'Bakery hours\nOpens at 7, closed Mondays' },
      })
      .returning();
    const { run, extractor } = handler();
    expect(await run(row!.id)).toBe('proposed');
    const rows = await ctx.t.db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.jobId, row!.id), like(llmCalls.purpose, 'extract%')));
    return { modelCalls: extractor.calls.length, llmRows: rows.length };
  }

  it('extracts a share from a user whose switch is on', async () => {
    await setSmartShare(member, true);
    expect(await share(member)).toEqual({ modelCalls: 1, llmRows: 1 });
  });

  it('extracts a platform admin whose column is false (FR-003)', async () => {
    const [row] = await ctx.t.db.select().from(users).where(eq(users.id, admin.id));
    expect(row!.smartShare).toBe(false);
    expect(await share(admin)).toEqual({ modelCalls: 1, llmRows: 1 });
  });

  it('switching off then on changes the next share only', async () => {
    await setSmartShare(member, false);
    expect(await share(member)).toEqual({ modelCalls: 0, llmRows: 0 });
    await setSmartShare(member, true);
    expect(await share(member)).toEqual({ modelCalls: 1, llmRows: 1 });
  });

  it('PATCH /me/profile ignores a smartShare field (FR-002)', async () => {
    await setSmartShare(member, false);
    const res = await ctx.app.request('/me/profile', {
      method: 'PATCH',
      headers: ctx.as(member.email),
      body: JSON.stringify({ smartShare: true, smart_share: true }),
    });
    expect(res.status).toBeLessThan(500);
    const [row] = await ctx.t.db.select().from(users).where(eq(users.id, member.id));
    expect(row!.smartShare).toBe(false);
    expect(JSON.stringify(await json(res))).not.toMatch(/smart_?share/i);
  });
});

/** 050 FR-010: the switch buys no extra volume; the existing caps still bind an unswitched user. */
describe.each([
  // Low per-channel cap: one channel full (the 51st by default). A text POST with no `channel`
  // lands on `paste` (channelFor), so that is the channel to fill.
  { name: 'per-channel cap', cap: 5, channels: ['paste'] as IngestChannel[], each: 5 },
  // Per-channel cap raised past 50: four channels at 50 fill the combined 200, none is full.
  {
    name: 'combined cap (the 201st)',
    cap: 100,
    channels: ['pwa', 'paste', 'shortcut', 'email'] as IngestChannel[],
    each: 50,
  },
])('ingest spend guard: $name (050)', ({ cap, channels, each }) => {
  const ctx = setupApiTest({
    env: { INGEST_DAILY_CAP: String(cap) },
    ingest: { enabled: true, uploads: null },
  });

  it('refuses the next share of an unswitched user with 429', async () => {
    const user = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, ctx.world.decks.family, user, 'editor');
    await ctx.sessionFor(user);
    await ctx.t.db.insert(ingestJobs).values(
      channels.flatMap((channel) =>
        Array.from({ length: each }, () => ({
          userId: user.id,
          deckId: ctx.world.decks.family.id,
          channel,
          status: 'proposed' as const,
          raw: { images: [] },
        })),
      ),
    );
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: ctx.as(user.email),
      body: JSON.stringify({ deckId: 'family', text: 'one more' }),
    });
    expect(res.status).toBe(429);
  });
});
