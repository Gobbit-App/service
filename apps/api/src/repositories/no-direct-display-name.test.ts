import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// D419: a member's name is computed with displayNameSql(); selecting the raw column shows a stale name.
// Allow-list: files that WRITE display_name rather than read it (none today; inserts use `v.displayName`).
const ALLOWED = new Set<string>([]);
const dir = dirname(fileURLToPath(import.meta.url));

describe('D419 no direct users.displayName', () => {
  it('no repository reads users.displayName', () => {
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !ALLOWED.has(f))
      .filter((f) => /\busers\.displayName\b/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
