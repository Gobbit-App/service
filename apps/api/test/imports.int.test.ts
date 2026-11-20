import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  ingestJobs,
  itemCategories,
  items,
  llmCalls,
  type DeckRow,
  type UserRow,
} from '@gobbit/db';
import {
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import {
  INGEST_CHANNEL_DAILY_CAPS,
  INGEST_COMBINED_DAILY_CAP,
  IMPORT_ROWS_PER_REQUEST,
  type IngestChannel,
} from '@gobbit/shared';
import { buildServices } from '../src/services';
import { json, setupApiTest } from './helpers';

const IMPORT_CAP = INGEST_CHANNEL_DAILY_CAPS.import!;
const LABEL = 'Street notes.md';

const DOWN_0016 = readFileSync(
  new URL('../../../packages/db/migrations/down/0016_import_channel.down.sql', import.meta.url),
  'utf8',
);

describe('POST /decks/{id}/imports (D190)', () => {
  const ctx = setupApiTest();
  let owner: UserRow;
  let deck: DeckRow;

  beforeAll(() => {
    owner = ctx.world.owner;
  });

  // A fresh deck per test, and no jobs left from the last one: caps count the owner's jobs.
  beforeEach(async () => {
    await ctx.t.db.delete(ingestJobs).where(eq(ingestJobs.userId, owner.id));
    deck = await createDeck(ctx.t.db, owner);
  });

  function importRows(rows: unknown[], email?: string, deckId = deck.id) {
    return ctx.app.request(`/decks/${deckId}/imports`, {
      method: 'POST',
      headers: ctx.as(email),
      body: JSON.stringify({ label: LABEL, rows }),
    });
  }

  const textRow = (title: string, extra: Record<string, unknown> = {}) => ({
    type: 'text',
    title,
    body: `${title} body`,
    ...extra,
  });

  /** Jobs made earlier today, straight in the table (no proposals behind them). */
  async function earlierJobs(channel: IngestChannel, count: number): Promise<void> {
    if (count === 0) return;
    await ctx.t.db.insert(ingestJobs).values(
      Array.from({ length: count }, () => ({
        userId: owner.id,
        deckId: deck.id,
        channel,
        status: 'published' as const,
        raw: { images: [] },
        createdAt: ctx.clock.now(),
      })),
    );
  }

  it('proposes each row on the import channel with the label, a suggestion and no LLM call', async () => {
    const llmBefore = await ctx.t.db.select({ n: sql<number>`count(*)::int` }).from(llmCalls);
    const res = await importRows([
      textRow('Clinic', { newCategory: 'Health' }),
      { type: 'link', title: 'Forms', sourceUrl: 'https://example.org/forms' },
    ]);

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ imported: 2, duplicates: 0, failed: [], refused: 0 });

    const jobs = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.deckId, deck.id));
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({ channel: 'import', clientLabel: LABEL, status: 'proposed' });
    }
    const clinicJob = jobs.find((j) => j.extraction?.newCategory === 'Health');
    expect(clinicJob).toBeDefined();

    const rows = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
    expect(rows.map((r) => [r.title, r.status, r.sourceKind, r.type]).sort()).toEqual([
      ['Clinic', 'proposed', 'import', 'text'],
      ['Forms', 'proposed', 'import', 'link'],
    ]);
    expect(rows.find((r) => r.type === 'link')?.payload).toMatchObject({
      url: 'https://example.org/forms',
    });

    const llmAfter = await ctx.t.db.select({ n: sql<number>`count(*)::int` }).from(llmCalls);
    expect(llmAfter[0]!.n).toBe(llmBefore[0]!.n);
  });

  it('stores a card-per-section body verbatim as a proposed card with no LLM call', async () => {
    const body = [
      'פסקה ראשונה על **הרישום** בקליניקה.',
      '',
      'פסקה שנייה, עם [הטפסים](https://example.org/forms) לקריאה.',
      '',
      '- להביא תעודת זהות',
      '- להביא **כרטיס קופת חולים**',
    ].join('\n');
    const llmBefore = await ctx.t.db.select({ n: sql<number>`count(*)::int` }).from(llmCalls);

    const res = await importRows([{ type: 'text', title: 'קליניקה', body }]);

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ imported: 1, duplicates: 0, failed: [], refused: 0 });
    const [row] = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
    expect(row!.body).toBe(body);
    expect(row!.status).toBe('proposed');
    const llmAfter = await ctx.t.db.select({ n: sql<number>`count(*)::int` }).from(llmCalls);
    expect(llmAfter[0]!.n).toBe(llmBefore[0]!.n);
  });

  it('files a row under every category it names, a link row keeping its URL (US2)', async () => {
    const a = await createCategory(ctx.t.db, deck);
    const b = await createCategory(ctx.t.db, deck);

    const res = await importRows([
      textRow('Clinic', { categoryIds: [a.id, b.id] }),
      { type: 'link', title: 'Forms', sourceUrl: 'https://example.org/forms', categoryIds: [a.id] },
    ]);

    expect(await json(res)).toEqual({ imported: 2, duplicates: 0, failed: [], refused: 0 });
    const rows = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
    const filed = await ctx.t.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.deckId, deck.id));
    const idsOf = (type: string) => {
      const id = rows.find((r) => r.type === type)!.id;
      return filed
        .filter((f) => f.itemId === id)
        .map((f) => f.categoryId)
        .sort();
    };
    expect(idsOf('text')).toEqual([a.id, b.id].sort());
    expect(idsOf('link')).toEqual([a.id]);
    const link = rows.find((r) => r.type === 'link')!;
    expect(link.payload).toMatchObject({ url: 'https://example.org/forms' });
    const jobs = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.deckId, deck.id));
    expect(jobs.find((j) => j.raw?.url)?.raw?.url).toBe('https://example.org/forms');
  });

  it('strict: refuses a row with an unmatched category, imports the matched one (D446)', async () => {
    const a = await createCategory(ctx.t.db, deck);
    const res = await ctx.app.request(`/decks/${deck.id}/imports`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        label: LABEL,
        strict: true,
        rows: [
          textRow('Clinic', { categoryIds: [a.id] }),
          textRow('Dentist', { unmatched: ['Teeth'] }),
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      imported: number;
      refused: number;
      failed: { index: number; problem: string; detail: string }[];
    };
    expect(body.imported).toBe(1);
    expect(body.refused).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({
      index: 1,
      problem: '/problems/import-unmatched-category',
    });
    expect(body.failed[0]!.detail).toContain('Teeth');
    const jobs = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.deckId, deck.id));
    expect(jobs).toHaveLength(1);
    expect(jobs.some((j) => j.extraction?.newCategory)).toBe(false);
  });

  it('non-strict: a row naming two new categories is refused (D446)', async () => {
    const res = await importRows([textRow('Clinic', { unmatched: ['Health', 'Teeth'] })]);

    const body = (await json(res)) as {
      imported: number;
      refused: number;
      failed: { problem: string }[];
    };
    expect(body.imported).toBe(0);
    expect(body.refused).toBe(1);
    expect(body.failed[0]!.problem).toBe('/problems/import-too-many-new-categories');
  });

  it('refuses a row naming a category of another deck, as proposeDirect does', async () => {
    const other = await createCategory(ctx.t.db, await createDeck(ctx.t.db, owner));

    const res = await importRows([textRow('Clinic', { categoryIds: [other.id] })]);

    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      imported: number;
      failed: { index: number; problem: string }[];
    };
    expect(body.imported).toBe(0);
    expect(body.failed).toEqual([
      expect.objectContaining({ index: 0, problem: '/problems/bad-request' }),
    ]);
    expect(await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id))).toHaveLength(0);
  });

  it('counts a row flagged as a duplicate and still imports it', async () => {
    await createItem(ctx.t.db, deck, {
      card: { type: 'link', title: 'Forms', payload: { url: 'https://example.org/forms' } },
    });

    const res = await importRows([
      { type: 'link', title: 'Forms again', sourceUrl: 'https://example.org/forms' },
    ]);

    expect(await json(res)).toEqual({ imported: 1, duplicates: 1, failed: [], refused: 0 });
    const [job] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.deckId, deck.id));
    expect(job!.dedup?.action).not.toBe('new');
  });

  it('refuses more rows than one request takes, or a bad row, importing nothing', async () => {
    const tooMany = Array.from({ length: IMPORT_ROWS_PER_REQUEST + 1 }, (_, i) =>
      textRow(`Note ${i}`),
    );
    expect((await importRows(tooMany)).status).toBe(400);

    const badLink = await importRows([textRow('Fine'), { type: 'link', title: 'No URL' }]);
    expect(badLink.status).toBe(400);
    const tooLong = await importRows([
      textRow('Fine'),
      textRow('Long', { body: 'x'.repeat(2001) }),
    ]);
    expect(tooLong.status).toBe(400);

    const rows = await ctx.t.db.select().from(items).where(eq(items.deckId, deck.id));
    expect(rows).toHaveLength(0);
  });

  it('stops at the daily import cap and reports the rest as rate limited', async () => {
    await earlierJobs('import', IMPORT_CAP - 1);

    const res = await importRows([textRow('One'), textRow('Two'), textRow('Three')]);

    expect(await json(res)).toEqual({
      imported: 1,
      duplicates: 0,
      refused: 0,
      failed: [
        expect.objectContaining({ index: 1, problem: '/problems/rate-limited' }),
        expect.objectContaining({ index: 2, problem: '/problems/rate-limited' }),
      ],
    });

    const again = await importRows([textRow('Four')]);
    expect(again.status).toBe(429);
    expect(again.headers.get('Retry-After')).toBe('3600');
  });

  it('neither counts toward nor is held by the combined cap', async () => {
    // Combined channels at their total (each under its own cap): imports still run.
    const counted: IngestChannel[] = ['pwa', 'shortcut', 'email', 'paste', 'mcp'];
    const each = INGEST_COMBINED_DAILY_CAP / counted.length;
    for (const channel of counted) await earlierJobs(channel, each);
    expect(await json(await importRows([textRow('Still fine')]))).toMatchObject({ imported: 1 });

    // Many imports don't use up the combined cap for normal shares.
    await ctx.t.db
      .delete(ingestJobs)
      .where(and(eq(ingestJobs.userId, owner.id), eq(ingestJobs.channel, 'pwa')));
    await earlierJobs('import', IMPORT_CAP);
    const { ingest } = buildServices({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      now: ctx.clock.now,
      search: { embedQueue: { enqueueIfStale: async () => undefined }, embedder: null },
    });
    const share = await ingest.proposeDirect({
      user: owner,
      deck: deck.id,
      draft: { type: 'text', title: 'A share', body: '', payload: {} },
      channel: 'pwa',
    });
    expect(share.itemId).toBeDefined();
  });

  it('is for owners and maintainers: editors and readers 403, non-members 404', async () => {
    const editor = await createAccountUser(ctx.t.db);
    const reader = await createAccountUser(ctx.t.db);
    const outsider = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, editor, 'editor');
    await addMember(ctx.t.db, deck, reader, 'reader');
    for (const user of [editor, reader, outsider]) await ctx.sessionFor(user);

    expect((await importRows([textRow('x')], editor.email)).status).toBe(403);
    expect((await importRows([textRow('x')], reader.email)).status).toBe(403);
    expect((await importRows([textRow('x')], outsider.email)).status).toBe(404);

    const maintainer = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, maintainer, 'maintainer');
    await ctx.sessionFor(maintainer);
    expect((await importRows([textRow('x')], maintainer.email)).status).toBe(200);
  });

  it('migration 0016 down refuses while import jobs exist', async () => {
    await earlierJobs('import', 1);
    await expect(ctx.t.db.execute(sql.raw(DOWN_0016))).rejects.toThrow(/import/);
    // The enum is untouched: another import job still inserts.
    await earlierJobs('import', 1);
  });
});
