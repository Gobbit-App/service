import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { itemEvents, items, type DeckRow, type ItemRow } from '@gobbit/db';
import { LINK_IMAGE_RULES_VERSION, type LinkPayload } from '@gobbit/shared';
import { createDeck, createItem, createSampleWorld, withTestDb } from '@gobbit/db/test';
import { BOSS_SCHEMA, createBoss } from '../src/jobs/boss';
import { ensureQueues } from '../src/jobs/ensure-queues';
import { BACKFILL_EVENT, runImageBackfill } from '../src/jobs/link-image-backfill';
import { QUEUES } from '../src/jobs/queues';
import { createItemsRepo } from '../src/repositories/items.repo';
import { captureLogger, expectDecision } from './capture-logger';

const SPACING_S = 60;

describe('links:image-backfill one-time pass (D351)', () => {
  const t = withTestDb();
  let boss: PgBoss;
  let deck: DeckRow;
  let ownerId: string;
  const cards: Record<string, ItemRow> = {};

  const link = (key: string, payload: LinkPayload) =>
    createItem(t.db, deck, { card: { type: 'link', title: key, payload } }).then((row) => {
      cards[key] = row;
      return row;
    });

  async function memberEdit(item: ItemRow, changes: string[]): Promise<void> {
    await t.db.insert(itemEvents).values({
      deckId: deck.id,
      itemId: item.id,
      actorUserId: ownerId,
      via: 'session',
      kind: 'updated',
      title: item.title,
      changes,
    });
  }

  async function queued(): Promise<{ itemId: string; delayS: number }[]> {
    const { rows } = await t.pool.query<{ item_id: string; delay_s: number }>(
      `select data->>'itemId' as item_id,
              round(extract(epoch from start_after - created_on))::int as delay_s
         from ${BOSS_SCHEMA}.job where name = $1 order by created_on`,
      [QUEUES.linkSnapshot],
    );
    return rows.map((r) => ({ itemId: r.item_id, delayS: r.delay_s }));
  }

  function run(dryRun = false) {
    const capture = captureLogger();
    const printed: string[] = [];
    const result = runImageBackfill(
      {
        items: createItemsRepo(t.db),
        sender: boss,
        log: capture.logger,
        print: (line) => printed.push(line),
      },
      { dryRun, hostSpacingS: SPACING_S, batch: 2 },
    );
    return { result, capture, printed };
  }

  beforeAll(async () => {
    const world = await createSampleWorld(t.db);
    ownerId = world.owner.id;
    deck = await createDeck(t.db, world.owner);
    boss = createBoss(t.url, 'sender');
    await boss.start();
    await ensureQueues(boss);

    // Qualify: text, no image, never looked at.
    await link('a1', { url: 'https://a.test/1', preview: { title: 'A one' } });
    await link('a2', { url: 'https://www.a.test/2', preview: { description: 'A two' } });
    await link('b1', { url: 'https://b.test/1', preview: { title: 'B one' } });
    await memberEdit(
      await link('titleEdit', { url: 'https://d.test/1', preview: { title: 'D' } }),
      ['title'],
    );
    // Scanned but skipped: a member edited the payload (a pre-041 removal left no marker).
    await memberEdit(
      await link('payloadEdit', { url: 'https://c.test/1', preview: { title: 'C' } }),
      ['title', 'payload'],
    );
    // Never scanned.
    await link('removed', { url: 'https://a.test/r', preview: { title: 'R', imageRemoved: true } });
    await link('stamped', {
      url: 'https://a.test/s',
      preview: { title: 'S', imageLookup: LINK_IMAGE_RULES_VERSION },
    });
    await link('withImage', {
      url: 'https://a.test/i',
      preview: { title: 'I', image: 'https://a.test/i.jpg' },
    });
    await link('noText', { url: 'https://a.test/n' });
    const deleted = await link('deleted', { url: 'https://a.test/d', preview: { title: 'Del' } });
    await t.db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, deleted.id));
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false });
  });

  it('--dry-run lists the cards and sends nothing', async () => {
    const { result, capture, printed } = run(true);
    const summary = await result;

    expect(summary).toMatchObject({ scanned: 5, enqueued: 0, skippedMemberEdit: 1, hosts: 3 });
    expect(printed).toHaveLength(4);
    expect(printed.join('\n')).not.toContain(cards.payloadEdit!.id);
    expect(await queued()).toEqual([]);
    await capture.flush();
    expect(expectDecision(capture.lines, BACKFILL_EVENT, { outcome: 'done' })).toMatchObject({
      dryRun: true,
    });
  });

  it('enqueues qualifying cards, spacing each host, and logs the summary', async () => {
    const { result, capture } = run();
    const summary = await result;

    expect(summary).toMatchObject({ scanned: 5, enqueued: 4, skippedMemberEdit: 1, hosts: 3 });
    const jobs = await queued();
    const delays = Object.fromEntries(jobs.map((j) => [j.itemId, j.delayS]));
    expect(Object.keys(delays).sort()).toEqual(
      [cards.a1!.id, cards.a2!.id, cards.b1!.id, cards.titleEdit!.id].sort(),
    );
    // a.test and www.a.test are one host (scanned by id): its second card waits one spacing.
    expect([delays[cards.a1!.id], delays[cards.a2!.id]].sort()).toEqual([0, SPACING_S]);
    expect(delays[cards.b1!.id]).toBe(0);
    expect(delays[cards.titleEdit!.id]).toBe(0);

    await capture.flush();
    const line = expectDecision(capture.lines, BACKFILL_EVENT, { outcome: 'done' });
    expect(line).toMatchObject({ scanned: 5, enqueued: 4, skippedMemberEdit: 1, hosts: 3 });
    expect(line.runId).toEqual(expect.any(String));
    expect(JSON.stringify(line)).not.toContain('a.test/1');
  });

  it('a rerun enqueues none (jobs are singletons per card)', async () => {
    const summary = await run().result;

    expect(summary.enqueued).toBe(0);
    expect(await queued()).toHaveLength(4);
  });
});
