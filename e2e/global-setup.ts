import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveE2eEnv } from './lib/env';

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

interface HealthResponse {
  ok: boolean;
  db_ms: number | null;
  migration: string | null;
  commit?: string | null;
}

export default async function globalSetup(): Promise<void> {
  const { baseURL: baseUrl, expectedSha, webBaseURL } = resolveE2eEnv();

  // Read the latest migration tag from journal
  const journalPath = fileURLToPath(
    new URL('../packages/db/migrations/meta/_journal.json', import.meta.url),
  );
  let latestTag: string | null = null;

  try {
    const journalContent = readFileSync(journalPath, 'utf-8');
    const journal: Journal = JSON.parse(journalContent);
    if (journal.entries.length > 0) {
      latestTag = journal.entries[journal.entries.length - 1].tag;
    }
  } catch (err) {
    console.error(`Failed to read migration journal at ${journalPath}`, err);
    throw err;
  }

  // Waiting for a fresh deploy (EXPECTED_SHA) covers the image pull + restart: up to 10 minutes.
  const maxAttempts = expectedSha ? 300 : 60; // 2 seconds per attempt
  const delayMs = 2000;
  let lastResponse: HealthResponse | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const body: HealthResponse = await response.json();
      lastResponse = body;

      console.log(
        `[${attempt}/${maxAttempts}] Health check: ok=${body.ok}, migration=${body.migration}, latest=${latestTag}` +
          (expectedSha ? `, commit=${body.commit ?? null}, expected=${expectedSha}` : ''),
      );

      if (
        body.ok &&
        body.migration === latestTag &&
        (!expectedSha || body.commit === expectedSha)
      ) {
        console.log('✓ API is ready');
        if (expectedSha) await waitForWebCommit(webBaseURL, expectedSha, maxAttempts, delayMs);
        return;
      }
    } catch (err) {
      console.log(
        `[${attempt}/${maxAttempts}] Health check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Timeout - throw with last response
  throw new Error(
    `API did not become ready within ${(maxAttempts * delayMs) / 1000} seconds. Last response: ${JSON.stringify(lastResponse)}`,
  );
}

/** Both images ship from one CI run (D62); smoke waits until the web image reports it too. */
async function waitForWebCommit(
  webBaseUrl: string,
  expectedSha: string,
  maxAttempts: number,
  delayMs: number,
): Promise<void> {
  let lastCommit: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${webBaseUrl}/version.json`, { cache: 'no-store' });
      const body = (await response.json()) as { commit?: string };
      lastCommit = body.commit ?? null;
      console.log(`[${attempt}/${maxAttempts}] web commit=${lastCommit}, expected=${expectedSha}`);
      if (lastCommit === expectedSha) {
        console.log('✓ Web is ready');
        return;
      }
    } catch (err) {
      console.log(
        `[${attempt}/${maxAttempts}] /version.json failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `Web did not report commit ${expectedSha} within ${(maxAttempts * delayMs) / 1000} seconds (last: ${lastCommit})`,
  );
}
