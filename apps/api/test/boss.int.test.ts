import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { createDeck, createItem, createSampleWorld, withTestDb } from '@gobbit/db/test';
import { BOSS_SCHEMA, createBoss } from '../src/jobs/boss';
import { createEmbedQueue } from '../src/jobs/embed-queue';
import { ensureQueues } from '../src/jobs/ensure-queues';
import { QUEUES } from '../src/jobs/queues';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';

describe('pg-boss wiring (P4.1, D72)', () => {
  const t = withTestDb();
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createBoss(t.url, 'sender');
    await boss.start();
    await ensureQueues(boss);
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false });
  });

  it('creates every queue with its policy, idempotently', async () => {
    await ensureQueues(boss);
    expect((await boss.getQueue(QUEUES.embedItem))?.policy).toBe('stately');
    expect((await boss.getQueue(QUEUES.embedSweep))?.policy).toBe('singleton');
    expect((await boss.getQueue(QUEUES.pruneSearchQueries))?.policy).toBe('singleton');
  });

  it('enqueues a stale item once per singleton key', async () => {
    const world = await createSampleWorld(t.db);
    const deck = await createDeck(t.db, world.owner);
    const item = await createItem(t.db, deck);
    const queue = createEmbedQueue({
      sender: boss,
      embeddings: createEmbeddingsRepo(t.db),
      model: 'fake-embedding',
    });

    await queue.enqueueIfStale(item.id);
    await queue.enqueueIfStale(item.id);

    const { rows } = await t.pool.query(
      `select count(*)::int as n from ${BOSS_SCHEMA}.job where name = $1 and data->>'itemId' = $2`,
      [QUEUES.embedItem, item.id],
    );
    expect(rows[0].n).toBe(1);
  });
});
