import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { createDb, createPool } from '@gobbit/db';
import { LINK_IMAGE_BACKFILL_HOST_SPACING_S } from '@gobbit/shared';
import { parseEnv } from '../src/env';
import { createBoss } from '../src/jobs/boss';
import { ensureQueues } from '../src/jobs/ensure-queues';
import { runImageBackfill } from '../src/jobs/link-image-backfill';
import { childLogger } from '../src/lib/logger';
import { createItemsRepo } from '../src/repositories/items.repo';

/**
 * `pnpm links:image-backfill [--dry-run] [--host-spacing <seconds>]` (D351): one-time pass that
 * enqueues `link-snapshot` for existing link cards with text but no image, at most one job per
 * host every `--host-spacing` seconds. A running worker with `CLOUDINARY_URL` does the lookups and
 * copies; a rerun enqueues none.
 */
const PAUSE_MS = 1_000;

function readOptions(): { dryRun: boolean; hostSpacingS: number } {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'host-spacing': { type: 'string', default: String(LINK_IMAGE_BACKFILL_HOST_SPACING_S) },
    },
  });
  const hostSpacingS = Number(values['host-spacing']);
  if (!Number.isInteger(hostSpacingS) || hostSpacingS < 0) {
    throw new Error('--host-spacing must be a whole number of seconds');
  }
  return { dryRun: values['dry-run'] ?? false, hostSpacingS };
}

async function main(): Promise<void> {
  const opts = readOptions();
  const env = parseEnv();
  if (!env.CLOUDINARY_URL && !opts.dryRun) {
    throw new Error('CLOUDINARY_URL is not set; nothing would be copied');
  }
  const pool = createPool(env.DATABASE_URL);
  const boss = createBoss(env.DATABASE_URL, 'sender');
  await boss.start();
  try {
    await ensureQueues(boss);
    const summary = await runImageBackfill(
      {
        items: createItemsRepo(createDb(pool)),
        sender: boss,
        log: childLogger('links-image-backfill'),
        pause: () => sleep(PAUSE_MS),
        print: (line) => console.log(line),
      },
      opts,
    );
    const verb = opts.dryRun ? 'would enqueue' : 'enqueued';
    const count = opts.dryRun ? summary.scanned - summary.skippedMemberEdit : summary.enqueued;
    console.log(
      `${verb} ${count} of ${summary.scanned} card(s) across ${summary.hosts} host(s); ` +
        `${summary.skippedMemberEdit} skipped (member edits)`,
    );
  } finally {
    await boss.stop({ graceful: false });
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
