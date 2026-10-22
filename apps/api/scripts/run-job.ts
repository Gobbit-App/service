import { parseEnv } from '../src/env';
import { createBoss } from '../src/jobs/boss';
import { ensureQueues } from '../src/jobs/ensure-queues';
import { QUEUES } from '../src/jobs/queues';

/**
 * Dev helper: `pnpm job:run media-sweep` enqueues one run of a
 * scheduled queue so a running worker picks it up now instead of at its cron time.
 */
async function main(): Promise<void> {
  const name = process.argv[2];
  const known: string[] = Object.values(QUEUES);
  if (!name || !known.includes(name)) {
    throw new Error(`usage: run-job.ts <queue>; one of: ${known.join(', ')}`);
  }
  const env = parseEnv();
  const boss = createBoss(env.DATABASE_URL, 'sender');
  await boss.start();
  try {
    await ensureQueues(boss);
    const id = await boss.send(name, {});
    console.log(id ? `queued ${name} (${id})` : `${name} is already queued`);
  } finally {
    await boss.stop({ graceful: false });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
