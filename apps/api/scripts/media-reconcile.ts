import { v2 as cloudinary } from 'cloudinary';
import { createDb, createPool } from '@pb/db';
import { parseEnv } from '../src/env';
import { parseCloudinaryUrl } from '../src/lib/cloudinary-url';
import { createCloudinaryMediaStore } from '../src/media/media-store';
import { parseReconcileArgs, RECONCILE_TAGS, unrecorded } from '../src/media/reconcile';
import { createAssetsRepo } from '../src/repositories/assets.repo';

/**
 * `pnpm media:reconcile [--delete]`: lists editor and ingest uploads that have no asset row
 * (made before 012 recorded them). Dry run by default; only `--delete` removes anything.
 */
const PAGE = 500;

async function listTagged(auth: Record<string, string>, tag: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = (await cloudinary.api.resources_by_tag(tag, {
      ...auth,
      resource_type: 'image',
      max_results: PAGE,
      ...(cursor ? { next_cursor: cursor } : {}),
    })) as { resources: { public_id: string }[]; next_cursor?: string };
    ids.push(...res.resources.map((r) => r.public_id));
    cursor = res.next_cursor;
  } while (cursor);
  return ids;
}

async function main(): Promise<void> {
  const args = parseReconcileArgs(process.argv.slice(2));
  const env = parseEnv();
  if (!env.CLOUDINARY_URL) throw new Error('CLOUDINARY_URL is not set');
  const creds = parseCloudinaryUrl(env.CLOUDINARY_URL);
  const auth = { cloud_name: creds.cloudName, api_key: creds.apiKey, api_secret: creds.apiSecret };
  const pool = createPool(env.DATABASE_URL);
  try {
    const assets = createAssetsRepo(createDb(pool));
    const found: string[] = [];
    for (const tag of RECONCILE_TAGS) {
      const listed = await listTagged(auth, tag);
      const recorded = new Set<string>();
      for (let i = 0; i < listed.length; i += PAGE) {
        for (const id of await assets.recordedAmong(listed.slice(i, i + PAGE))) recorded.add(id);
      }
      const missing = unrecorded(listed, recorded);
      console.log(`${tag}: ${listed.length} listed, ${missing.length} without an asset row`);
      found.push(...missing);
    }
    for (const id of found) console.log(`  ${id}`);

    if (!args.delete) {
      console.log(found.length ? 'dry run: pass --delete to remove them' : 'nothing to do');
      return;
    }
    const outcomes = await createCloudinaryMediaStore(creds).deleteMany(found);
    const failed = [...outcomes.values()].filter((o) => o === 'failed').length;
    console.log(`deleted ${found.length - failed}, failed ${failed}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
