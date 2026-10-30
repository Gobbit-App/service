/**
 * D57: initial JS ≤ 150 KB gzip. Reads `dist/.vite/manifest.json` (run `pnpm build` first),
 * follows static imports from the entry and fails when the gzipped total is over budget.
 * D139: also fails when a lazy-only library (`@use-gesture`, `papaparse`) lands in an initial chunk.
 * D232: and when the built `index.html` references the analytics proxy (the tracker is landing-only).
 */
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  checkBudget,
  initialChunkFiles,
  lazyOnlyViolations,
  type ViteManifest,
} from './initial-chunks';
import { shellTrackerViolations } from './shell-check';

const LIMIT_BYTES = 150 * 1024;
const DIST = new URL('../dist/', import.meta.url);

async function main(): Promise<void> {
  const manifestPath = new URL('.vite/manifest.json', DIST);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;

  const chunks = await Promise.all(
    initialChunkFiles(manifest).map(async (file) => {
      const code = await readFile(new URL(file, DIST));
      return { file, code: code.toString('utf8'), gzipBytes: gzipSync(code).length };
    }),
  );
  const { totalBytes, ok } = checkBudget(chunks, LIMIT_BYTES);

  for (const e of chunks)
    console.log(`${(e.gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${e.file}`);
  const summary = `initial JS ${(totalBytes / 1024).toFixed(1)} KB gzip (budget ${LIMIT_BYTES / 1024} KB)`;

  const violations = lazyOnlyViolations(chunks);
  for (const violation of violations)
    console.error(`✗ lazy-only library in initial JS: ${violation}`);

  const shellViolations = shellTrackerViolations(
    await readFile(new URL('index.html', DIST), 'utf8'),
  );
  for (const violation of shellViolations) console.error(`✗ index.html: ${violation}`);

  if (!ok) console.error(`✗ ${summary}`);
  if (!ok || violations.length > 0 || shellViolations.length > 0) process.exit(1);
  console.log(`✓ ${summary}; no lazy-only libraries in initial chunks; no tracker in index.html`);
}

main().catch((err: unknown) => {
  console.error(`bundle budget check failed (${fileURLToPath(DIST)}):`, err);
  process.exit(1);
});
