import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/identity';
import { stack, webUrl } from '../../lib/stack';

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

test('GET /health reports ok and the latest migration @smoke', async ({ api, anon }) => {
  const latestTag = getLatestMigrationTag();

  const response = await api.get('health');
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(typeof body.db_ms).toBe('number');
  expect(body.migration).toBe(latestTag);

  // The runner builds both images from stack.commit.
  const version = await anon.get(webUrl('version.json'));
  expect(version.status()).toBe(200);
  expect(body.commit).toBe(stack.commit);
  expect(((await version.json()) as { commit?: string }).commit).toBe(stack.commit);
});
