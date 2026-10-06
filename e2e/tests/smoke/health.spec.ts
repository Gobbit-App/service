import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/api';
import { resolveE2eEnv } from '../../lib/env';

const getLatestMigrationTag = (): string | null => {
  try {
    const journalUrl = new URL(
      '../../../packages/db/migrations/meta/_journal.json',
      import.meta.url,
    );
    const content = readFileSync(fileURLToPath(journalUrl), 'utf-8');
    const journal = JSON.parse(content);
    const entries = journal.entries || [];
    if (entries.length === 0) return null;
    return entries[entries.length - 1].tag;
  } catch {
    return null;
  }
};

test('GET /health reports ok and the latest migration @smoke', async ({ api }) => {
  const latestTag = getLatestMigrationTag();

  const response = await api.get('health');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(typeof body.db_ms).toBe('number');
  expect(body.migration).toBe(latestTag);

  const { expectedSha } = resolveE2eEnv();
  if (expectedSha) expect(body.commit).toBe(expectedSha);
});
