/**
 * D57: initial JS ≤ 150 KB gzip. Reads `dist/.vite/manifest.json` (run `pnpm build` first),
 * follows static imports from the entry and fails when the gzipped total is over budget.
 */
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { checkBudget, initialChunkFiles, type ViteManifest } from './initial-chunks';

const LIMIT_BYTES = 150 * 1024;
const DIST = new URL('../dist/', import.meta.url);

async function main(): Promise<void> {
  const manifestPath = new URL('.vite/manifest.json', DIST);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;

  const entries = await Promise.all(
    initialChunkFiles(manifest).map(async (file) => ({
      file,
      gzipBytes: gzipSync(await readFile(new URL(file, DIST))).length,
    })),
  );
  const { totalBytes, ok } = checkBudget(entries, LIMIT_BYTES);

  for (const e of entries)
    console.log(`${(e.gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${e.file}`);
  const summary = `initial JS ${(totalBytes / 1024).toFixed(1)} KB gzip (budget ${LIMIT_BYTES / 1024} KB)`;

  if (!ok) {
    console.error(`✗ ${summary}`);
    process.exit(1);
  }
  console.log(`✓ ${summary}`);
}

main().catch((err: unknown) => {
  console.error(`bundle budget check failed (${fileURLToPath(DIST)}):`, err);
  process.exit(1);
});
