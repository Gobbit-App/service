import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as cardLimits from './card-limits';
import * as limits from './limits';
import { codePointLength, utf8Bytes } from './utils/utf8-bytes';

const srcDir = dirname(fileURLToPath(import.meta.url));
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g;

/** Walks the relative import graph of a module and returns every bare (package) specifier. */
function packageImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1]!;
      if (spec.startsWith('.')) {
        visit(resolve(dirname(file), spec.endsWith('.ts') ? spec : `${spec}.ts`));
      } else {
        packages.add(spec);
      }
    }
  };
  visit(entry);
  return packages;
}

describe('card-limits', () => {
  it('re-exports the same values as limits.ts', () => {
    expect(cardLimits.CARD_TITLE_MAX).toBe(limits.CARD_TITLE_MAX);
    expect(cardLimits.CARD_BODY_MAX).toBe(limits.CARD_BODY_MAX);
    expect(cardLimits.PAYLOAD_MAX_BYTES).toBe(limits.PAYLOAD_MAX_BYTES);
    expect(cardLimits.TABLE_MAX_ROWS).toBe(limits.TABLE_MAX_ROWS);
    expect(cardLimits.TABLE_MAX_COLUMNS).toBe(limits.TABLE_MAX_COLUMNS);
    expect(cardLimits.CALC_MAX_FIELDS).toBe(limits.CALC_MAX_FIELDS);
    expect(cardLimits.NAME_MAX).toBe(limits.NAME_MAX);
  });

  it('re-exports the code point and byte counters', () => {
    expect(cardLimits.codePointLength).toBe(codePointLength);
    expect(cardLimits.utf8Bytes).toBe(utf8Bytes);
  });

  it('imports no zod or mathjs anywhere in its module graph', () => {
    const packages = packageImports(resolve(srcDir, 'card-limits.ts'));
    expect([...packages]).not.toContain('zod');
    expect([...packages]).not.toContain('mathjs');
  });
});
