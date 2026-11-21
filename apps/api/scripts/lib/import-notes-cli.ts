import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MEDIA_MAX_BYTES_DEFAULTS, type Category } from '@gobbit/shared';
import { IMPORT_LABEL_MAX } from '@gobbit/shared/ingest-constants';
import {
  detectFormat,
  importFormats,
  importInChunks,
  parseNotes,
  report,
  toImportDraft,
  type ImportFormat,
  type ImportRow,
  type ImportRowDraft,
  type MediaCheck,
  type ImportRunResult,
} from '@gobbit/shared/import';
import { classifyShareFiles } from '../../src/ingest/classify-files';
import { ApiCliError, type ApiRequest } from './api-cli';
import { cloudinaryUploader, createMediaImporter, type MediaUploader } from './import-media';

/** Injectable for tests: the file reader (sync, also used by the dry-run check) and the uploader. */
export interface ImportNotesDeps {
  readFile: (absPath: string) => Uint8Array;
  uploader: MediaUploader;
}
const defaultDeps: ImportNotesDeps = { readFile: readFileSync, uploader: cloudinaryUploader };

/** D190: `pnpm import:notes <file> --deck <slug> [--format] [--label] [--dry-run]`. */
export interface ImportNotesOptions {
  file: string;
  /** Optional only with `--dry-run` (deck checks are then skipped, D448). */
  deck: string | null;
  format: ImportFormat | null;
  label: string;
  dryRun: boolean;
  /** D446: refuse rows naming a category the deck lacks (default on). */
  strict: boolean;
  /** Only needed to send; a dry run never calls the API. */
  baseUrl: string | null;
  token: string | null;
}

export const IMPORT_NOTES_USAGE =
  'Usage: pnpm import:notes <file> --deck <slug> [--format lines|markdown|csv] [--label <text>] [--dry-run] [--no-strict]\n' +
  'A row may name a cover or (type: media) an image/file by a path relative to the notes file; each is uploaded before the import, --dry-run only checks the files exist and are accepted.\n' +
  'Strict by default: a row naming a category the deck does not have is refused, not imported; --no-strict suggests one new category per row instead.\n' +
  '--dry-run reports cards per category and problems (exit 1 if any) and writes nothing; --deck and a token are then optional (without them deck checks are skipped).';

const isFormat = (value: string): value is ImportFormat =>
  (importFormats as readonly string[]).includes(value);

/** Flags and env (`GOBBIT_API_URL`, `GOBBIT_TOKEN`); throws a message meant for the terminal. */
export function parseImportNotesArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): ImportNotesOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      deck: { type: 'string' },
      format: { type: 'string' },
      label: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'no-strict': { type: 'boolean', default: false },
    },
  });
  const file = positionals[0];
  if (!file || (!values.deck && !values['dry-run'])) throw new Error(IMPORT_NOTES_USAGE);
  if (values.format !== undefined && !isFormat(values.format)) {
    throw new Error(`--format must be one of ${importFormats.join(', ')}`);
  }
  const dryRun = values['dry-run'];
  const baseUrl = env.GOBBIT_API_URL?.replace(/\/+$/, '') || null;
  const token = env.GOBBIT_TOKEN || null;
  if (!dryRun && (!baseUrl || !token)) {
    throw new Error(
      'Set GOBBIT_API_URL (the API base, e.g. http://127.0.0.1:3000) and GOBBIT_TOKEN ' +
        '(an owner or maintainer session token), or pass --dry-run',
    );
  }
  const label = (values.label ?? basename(file)).trim().slice(0, IMPORT_LABEL_MAX);
  if (!label) throw new Error('--label must not be empty');
  const strict = !values['no-strict'];
  return {
    file,
    deck: values.deck ?? null,
    format: values.format ?? null,
    label,
    dryRun,
    strict,
    baseUrl,
    token,
  };
}

export type Log = (line: string) => void;

const describeRow = (row: ImportRow): string =>
  [
    `line ${row.line}`,
    `[${row.type}]`,
    row.title,
    row.categories.length ? `(${row.categories.join(', ')})` : '',
    row.error ? `— ${row.error}` : '',
  ]
    .filter(Boolean)
    .join(' ');

/** A failed chunk's rows carry the API status and the start of its body. */
function describeError(err: unknown) {
  if (err instanceof ApiCliError) return { problem: `HTTP ${err.status}`, detail: err.message };
  return {
    problem: '/problems/request-failed',
    detail: err instanceof Error ? err.message : String(err),
  };
}

const deckCategories = async (request: ApiRequest, deck: string) =>
  (await request<{ data: Category[] }>('GET', `/decks/${deck}/categories`)).data;

/** D448: read-only report from the shared `report`; the only call is GET categories. */
/** Dry-run file checks: reads through the injected `readFile`, uploads nothing. */
function mediaCheck(opts: ImportNotesOptions, deps: ImportNotesDeps): MediaCheck {
  const baseDir = dirname(opts.file);
  const read = (p: string): Uint8Array | null => {
    try {
      return deps.readFile(resolve(baseDir, p));
    } catch {
      return null;
    }
  };
  return {
    fileExists: (p) => read(p) !== null,
    kindOf: (p) => {
      const bytes = read(p);
      if (!bytes) return null;
      const { images, file } = classifyShareFiles(
        [{ bytes, mime: '', name: basename(p) }],
        MEDIA_MAX_BYTES_DEFAULTS,
      );
      return (images[0] ?? file)?.kind ?? null;
    },
  };
}

async function dryRun(
  parsed: ReturnType<typeof parseNotes>,
  format: ImportFormat,
  opts: ImportNotesOptions,
  request: ApiRequest,
  deck: string,
  log: Log,
  deps: ImportNotesDeps,
): Promise<number> {
  const media = mediaCheck(opts, deps);
  const r = report(parsed.rows, await deckCategories(request, deck), {
    strict: opts.strict,
    media,
  });
  const problems = [
    ...r.problems,
    ...parsed.ignored.map((i) => ({ line: i.line, message: `text ignored: ${i.text}` })),
  ].sort((a, b) => a.line - b.line);
  log(`${opts.file} (${format}) — ${r.cards} card${r.cards === 1 ? '' : 's'}`);
  for (const c of r.categories) log(`  ${c.name}  ${c.count}`);
  if (problems.length) {
    log('problems:');
    for (const p of problems) log(`  line ${p.line}: ${p.message}`);
  }
  return problems.length ? 1 : 0;
}

/**
 * Parses the text with the web preview's parser, skips invalid rows, maps categories to the
 * deck's (by id) and sends the rest in chunks. Resolves to the exit code: 1 when any row was
 * not imported (invalid or failed).
 */
export async function runImportNotes(
  text: string,
  opts: ImportNotesOptions,
  request: ApiRequest | null,
  log: Log = console.log,
  deps: ImportNotesDeps = defaultDeps,
): Promise<number> {
  const format = opts.format ?? detectFormat(text, opts.file);
  const parsed = parseNotes(text, format);
  if (parsed.problem) {
    log(parsed.problem);
    return 1;
  }
  // No deck (dry run only) means no category lookup, whatever the credentials.
  const deck = opts.deck ?? '';
  if (opts.dryRun && request && opts.deck)
    return dryRun(parsed, format, opts, request, deck, log, deps);
  if (!opts.deck) request = null;
  let valid = parsed.rows.filter((row) => row.error === null);
  const invalid = parsed.rows.filter((row) => row.error !== null);
  for (const row of invalid) log(`skipped ${describeRow(row)}`);

  // Without a request (no credentials) the deck's categories are unknown: nothing to compare.
  const categories = request ? await deckCategories(request, deck) : [];
  let drafts: ImportRowDraft[] = valid.map((row) =>
    toImportDraft(row, categories, { strict: opts.strict }),
  );
  let unmatched = 0;
  let skipped = 0;
  if (request) {
    valid.forEach((row, i) => {
      const names = drafts[i]?.unmatched;
      if (!names?.length) return;
      unmatched += 1;
      log(`unmatched categories line ${row.line}: ${names.join(', ')}`);
    });
    if (unmatched > 0 && opts.strict) {
      log(
        `strict mode refuses ${unmatched} row(s) with unmatched categories (--no-strict allows one new category per row)`,
      );
    }
  }

  // Upload files before proposing; a row whose upload fails is skipped like an invalid one.
  // Orphans from skipped or refused rows are left to media-sweep.
  if (request) {
    const importer = createMediaImporter({
      request,
      deckId: deck,
      baseDir: dirname(opts.file),
      readFile: async (abs) => deps.readFile(abs),
      uploader: deps.uploader,
    });
    const keep: boolean[] = [];
    for (const [i, row] of valid.entries()) {
      const draft = drafts[i]!;
      if ((!row.cover && !row.image) || (opts.strict && draft.unmatched?.length)) {
        keep.push(true);
        continue;
      }
      try {
        if (row.cover) draft.cover = await importer.cover(row.cover, row.line);
        if (row.image) {
          draft.type = 'media';
          draft.payload = await importer.image(row.image, row.line);
        }
        keep.push(true);
      } catch (err) {
        log(`skipped ${describeRow(row)} — ${err instanceof Error ? err.message : String(err)}`);
        keep.push(false);
        skipped += 1;
      }
    }
    valid = valid.filter((_, i) => keep[i]);
    drafts = drafts.filter((_, i) => keep[i]);
  }

  if (!request) {
    const media = opts.dryRun ? mediaCheck(opts, deps) : null;
    let missing = 0;
    for (const row of valid) {
      log(describeRow(row));
      for (const path of [row.cover, row.image]) {
        if (!media || !path) continue;
        const problem = !media.fileExists(path)
          ? `file "${path}" not found`
          : media.kindOf(path) === null
            ? `file "${path}" is not an accepted kind`
            : null;
        if (problem) {
          missing += 1;
          log(`  line ${row.line}: ${problem}`);
        }
      }
    }
    for (const i of parsed.ignored) log(`text ignored line ${i.line}: ${i.text}`);
    log('skipped deck checks: categories not compared (pass --deck and set a token)');
    log(`dry run (${format}): ${valid.length} to import, ${invalid.length} invalid`);
    return invalid.length > 0 || parsed.ignored.length > 0 || missing > 0 ? 1 : 0;
  }

  let result: ImportRunResult;
  try {
    result = await importInChunks(
      drafts,
      (rows) =>
        request<ImportRunResult>('POST', `/decks/${deck}/imports`, {
          label: opts.label,
          strict: opts.strict,
          rows,
        }),
      { describeError },
    );
  } catch (err) {
    // Daily cap hit before anything was imported: say why and stop, no retry loop.
    if (!(err instanceof ApiCliError) || err.status !== 429) throw err;
    log(`import limit reached, nothing imported (the answer says when it lifts): ${err.message}`);
    return 1;
  }
  const limited = result.failed.filter((f) => f.problem === '/problems/rate-limited');
  if (limited.length > 0) {
    log(
      `import limit reached: ${limited[0]?.detail ?? 'daily limit'}; ${limited.length} row(s) not imported, run again after it lifts`,
    );
  }
  for (const failure of result.failed) {
    if (failure.problem === '/problems/rate-limited') continue;
    const row = valid[failure.index];
    log(
      `failed ${row ? describeRow(row) : `row ${failure.index + 1}`}: ${failure.detail ?? failure.problem}`,
    );
  }
  log(
    `imported ${result.imported}, duplicates ${result.duplicates}, failed ${result.failed.length}` +
      (result.refused ? `, refused ${result.refused}` : '') +
      (invalid.length + skipped > 0 ? `, invalid ${invalid.length + skipped}` : ''),
  );
  if (result.imported > 0) log(`review them under "${opts.label}" in /d/${deck}/review`);
  return result.failed.length > 0 || invalid.length + skipped > 0 ? 1 : 0;
}
