import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { detectFormat, parseNotes, toImportDraft } from '@gobbit/shared/import';
import { IMPORT_ROWS_PER_REQUEST } from '@gobbit/shared/ingest-constants';
import { ApiCliError, type ApiRequest } from './api-cli';
import {
  IMPORT_NOTES_USAGE,
  parseImportNotesArgs,
  runImportNotes,
  type ImportNotesOptions,
} from './import-notes-cli';

const ENV = { GOBBIT_API_URL: 'http://api.test/', GOBBIT_TOKEN: 'tok' };

const options = (overrides: Partial<ImportNotesOptions> = {}): ImportNotesOptions => ({
  file: 'notes.txt',
  deck: 'family',
  format: null,
  label: 'notes.txt',
  dryRun: false,
  strict: true,
  baseUrl: 'http://api.test',
  token: 'tok',
  ...overrides,
});

/** A fake API: categories plus an imports endpoint that accepts every row it gets. */
function fakeApi(answerImport?: (rows: unknown[]) => unknown) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.endsWith('/categories')) {
      return { data: [{ id: 'c-recipes', name: 'Recipes', slug: 'recipes' }] };
    }
    const rows = (body as { rows: unknown[] }).rows;
    return answerImport ? answerImport(rows) : { imported: rows.length, duplicates: 0, failed: [] };
  }) as unknown as ApiRequest;
  return { request, calls };
}

const lines = (n: number) => Array.from({ length: n }, (_, i) => `Note ${i + 1}`).join('\n');

describe('parseImportNotesArgs (D190)', () => {
  it('reads the file, deck, format and label; the label defaults to the file name', () => {
    expect(
      parseImportNotesArgs(['dir/notes.csv', '--deck', 'family', '--format', 'csv'], ENV),
    ).toEqual({
      file: 'dir/notes.csv',
      deck: 'family',
      format: 'csv',
      label: 'notes.csv',
      dryRun: false,
      strict: true,
      baseUrl: 'http://api.test',
      token: 'tok',
    });
  });

  it('is strict unless --no-strict (D446)', () => {
    expect(parseImportNotesArgs(['a.txt', '--deck', 'd'], ENV).strict).toBe(true);
    expect(parseImportNotesArgs(['a.txt', '--deck', 'd', '--no-strict'], ENV).strict).toBe(false);
    expect(IMPORT_NOTES_USAGE).toMatch(/--no-strict/);
  });

  it('explains the missing env unless it is a dry run', () => {
    expect(() => parseImportNotesArgs(['a.txt', '--deck', 'd'], {})).toThrow(/GOBBIT_API_URL/);
    expect(parseImportNotesArgs(['a.txt', '--deck', 'd', '--dry-run'], {})).toMatchObject({
      dryRun: true,
      baseUrl: null,
      token: null,
    });
  });

  it('needs a file and a deck, and a known format', () => {
    expect(() => parseImportNotesArgs(['--deck', 'd'], ENV)).toThrow(IMPORT_NOTES_USAGE);
    expect(() => parseImportNotesArgs(['a.txt'], ENV)).toThrow(IMPORT_NOTES_USAGE);
    expect(() => parseImportNotesArgs(['a.txt', '--deck', 'd', '--format', 'xml'], ENV)).toThrow(
      /--format/,
    );
  });
});

describe('runImportNotes (D190)', () => {
  it('sends the rows in chunks of 100 under the label and exits 0', async () => {
    const { request, calls } = fakeApi();
    const log = vi.fn();
    const code = await runImportNotes(lines(IMPORT_ROWS_PER_REQUEST + 20), options(), request, log);
    expect(code).toBe(0);
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.path)).toEqual(['/decks/family/imports', '/decks/family/imports']);
    expect(posts.map((c) => (c.body as { rows: unknown[] }).rows.length)).toEqual([
      IMPORT_ROWS_PER_REQUEST,
      20,
    ]);
    expect((posts[0]!.body as { label: string }).label).toBe('notes.txt');
    expect(log).toHaveBeenCalledWith('imported 120, duplicates 0, failed 0');
  });

  it('maps a heading to the deck category by id', async () => {
    const { request, calls } = fakeApi();
    await runImportNotes('# Recipes\n- Hummus', options({ file: 'n.md' }), request, vi.fn());
    const post = calls.find((c) => c.method === 'POST');
    expect((post?.body as { rows: unknown[] }).rows).toEqual([
      expect.objectContaining({ title: 'Hummus', categoryIds: ['c-recipes'] }),
    ]);
  });

  it.each([true, false])('sends strict: %s in the request body', async (strict) => {
    const { request, calls } = fakeApi();
    await runImportNotes('Milk', options({ strict }), request, vi.fn());
    const post = calls.find((c) => c.method === 'POST');
    expect((post?.body as { strict: boolean }).strict).toBe(strict);
  });

  it('reports unmatched category names per line and the server refusals', async () => {
    const { request } = fakeApi((rows) => ({
      imported: 0,
      duplicates: 0,
      refused: rows.length,
      failed: [{ index: 0, problem: '/problems/import-refused', detail: 'Unknown category' }],
    }));
    const log = vi.fn();
    const code = await runImportNotes('# Games\n- Chess', options({ file: 'n.md' }), request, log);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^unmatched categories line \d+: Games/),
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^strict mode refuses 1 row/));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^failed .*Unknown category/));
    expect(log).toHaveBeenCalledWith('imported 0, duplicates 0, failed 1, refused 1');
  });

  it('prints the rows on a dry run without calling the API', async () => {
    const log = vi.fn();
    const code = await runImportNotes('Milk\nBread', options({ dryRun: true }), null, log);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith('line 1 [text] Milk');
    expect(log).toHaveBeenCalledWith('dry run (lines): 2 to import, 0 invalid');
  });

  it('exits 1 and lists the failed rows by source line', async () => {
    const { request } = fakeApi((rows) => ({
      imported: rows.length - 1,
      duplicates: 1,
      failed: [{ index: 1, problem: '/problems/rate-limited', detail: 'Daily limit' }],
    }));
    const log = vi.fn();
    const code = await runImportNotes('One\nTwo\nThree', options(), request, log);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/import limit reached: Daily limit; 1 row/),
    );
    expect(log).toHaveBeenCalledWith('imported 2, duplicates 1, failed 1');
  });

  it('adds counts across chunks and stops at the cap with exit 1', async () => {
    let n = 0;
    const { request, calls } = fakeApi((rows) =>
      ++n === 1
        ? { imported: rows.length, duplicates: 0, failed: [] }
        : {
            imported: 0,
            duplicates: 0,
            failed: [
              { index: 0, problem: '/problems/rate-limited', detail: 'until 2026-11-21T00:00:00Z' },
            ],
          },
    );
    const log = vi.fn();
    const code = await runImportNotes(
      lines(IMPORT_ROWS_PER_REQUEST * 2 + 5),
      options(),
      request,
      log,
    );
    expect(code).toBe(1);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2026-11-21T00:00:00Z'));
    expect(log).toHaveBeenCalledWith(`imported ${IMPORT_ROWS_PER_REQUEST}, duplicates 0, failed 6`);
  });

  it('stops cleanly with exit 1 when the first request answers 429', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET') return { data: [] };
      throw new ApiCliError(429, `POST ${path}`, 'Daily import limit reached');
    }) as unknown as ApiRequest;
    const log = vi.fn();
    expect(await runImportNotes('One', options(), request, log)).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Daily import limit reached'));
  });

  it('skips invalid rows, reports them and exits 1', async () => {
    const { request, calls } = fakeApi();
    const log = vi.fn();
    const code = await runImportNotes(`Ok\n${'x'.repeat(2100)}`, options(), request, log);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^skipped line 2/));
    const post = calls.find((c) => c.method === 'POST');
    expect((post?.body as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('rethrows when the first request is refused', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET') return { data: [] };
      throw new ApiCliError(403, `POST ${path}`, 'forbidden');
    }) as unknown as ApiRequest;
    await expect(runImportNotes('One', options(), request, vi.fn())).rejects.toThrow(/403/);
  });
});

describe('runImportNotes --dry-run (D448)', () => {
  const dry = options({ dryRun: true });

  it('reads the deck categories, never POSTs, and exits 0 when clean', async () => {
    const { request, calls } = fakeApi();
    const log = vi.fn();
    const code = await runImportNotes(
      '# Recipes\n- Hummus',
      { ...dry, file: 'n.md' },
      request,
      log,
    );
    expect(code).toBe(0);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /decks/family/categories']);
    const out = log.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/1 card/);
    expect(out).toMatch(/Recipes\s+1/);
    expect(out).not.toMatch(/problems:/);
  });

  it('lists each problem with its line, exits 1 and still writes nothing', async () => {
    const { request, calls } = fakeApi();
    const log = vi.fn();
    const text = '# Games\n## Chess\n\n## Go\ncolour: red\n';
    const code = await runImportNotes(text, { ...dry, file: 'n.md' }, request, log);
    expect(code).toBe(1);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    const out = log.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/problems:/);
    expect(out).toMatch(/line 2:.*Games/);
    expect(out).toMatch(/line 5:.*colour/);
  });

  it('without a deck or token skips the deck checks and says so', async () => {
    const log = vi.fn();
    const code = await runImportNotes('Milk', { ...dry, baseUrl: null, token: null }, null, log);
    expect(code).toBe(0);
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toMatch(/skipp\w* .*categor/i);
  });

  it('parses --dry-run without --deck or env', () => {
    expect(parseImportNotesArgs(['a.txt', '--dry-run'], {})).toMatchObject({
      dryRun: true,
      deck: null,
      token: null,
    });
  });
});

describe('CLI and shared parser agree (FR-006)', () => {
  const dir = new URL('../../../../packages/shared/src/import/fixtures/', import.meta.url);
  const categories = [{ id: 'c-recipes', name: 'Recipes', slug: 'recipes' }];

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    it(`sends the rows parseNotes yields for ${name}`, async () => {
      const text = readFileSync(new URL(name, dir), 'utf8');
      const { request, calls } = fakeApi();
      await runImportNotes(text, options({ file: name }), request, vi.fn());
      const sent = calls
        .filter((c) => c.method === 'POST')
        .flatMap((c) => (c.body as { rows: unknown[] }).rows);
      const expected = parseNotes(text, detectFormat(text, name))
        .rows.filter((row) => row.error === null)
        .map((row) => toImportDraft(row, categories as never, { strict: true }));
      expect(sent).toEqual(expected);
    });
  }
});
