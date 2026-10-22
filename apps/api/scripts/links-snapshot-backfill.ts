import { setTimeout as sleep } from 'node:timers/promises';
import { createDb, createPool } from '@pb/db';
import { parseEnv } from '../src/env';
import { createBoss } from '../src/jobs/boss';
import { ensureQueues } from '../src/jobs/ensure-queues';
import { createLinkSnapshotQueue } from '../src/jobs/link-snapshot-queue';
import { createItemsRepo } from '../src/repositories/items.repo';

/**
 * `pnpm links:snapshot-backfill` (D163): enqueues `link-snapshot` for existing live link cards
 * that have a remote `preview.image` and no stored copy, 100 at a time. A running worker with
 * `CLOUDINARY_URL` set does the copies; jobs are singletons per card, so a rerun is safe.
 */
const BATCH = 100;
const PAUSE_MS = 1_000;

async function main(): Promise<void> {
  const env = parseEnv();
  if (!env.CLOUDINARY_URL) throw new Error('CLOUDINARY_URL is not set; nothing would be copied');
  const pool = createPool(env.DATABASE_URL);
  const boss = createBoss(env.DATABASE_URL, 'sender');
  await boss.start();
  try {
    await ensureQueues(boss);
    const items = createItemsRepo(createDb(pool));
    const queue = createLinkSnapshotQueue({ sender: boss, log: (line) => console.error(line) });
    let afterId: string | null = null;
    let queued = 0;
    for (;;) {
      const rows = await items.linkSnapshotCandidates(afterId, BATCH);
      for (const row of rows) await queue.enqueueIfNeeded(row);
      queued += rows.length;
      if (rows.length < BATCH) break;
      afterId = rows[rows.length - 1]!.id;
      console.log(`queued ${queued} so far`);
      await sleep(PAUSE_MS);
    }
    console.log(`queued ${queued} link snapshot job(s)`);
  } finally {
    await boss.stop({ graceful: false });
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
