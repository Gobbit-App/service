import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import type { Category } from '@gobbit/shared';
import { IMPORT_LABEL_MAX } from '@gobbit/shared/ingest-constants';
import {
  detectFormat,
  importFormats,
  importInChunks,
  parseNotes,
  toImportDraft,
  type ImportFormat,
  type ImportRow,
  type ImportRunResult,
} from '@gobbit/shared/import';
import { ApiCliError, type ApiRequest } from './api-cli';

/** D190: `pnpm import:notes <file> --deck <slug> [--format] [--label] [--dry-run]`. */
export interface ImportNotesOptions {
  file: string;
  deck: string;
  format: ImportFormat | null;
  label: string;
  dryRun: boolean;
  /** Only needed to send; a dry run never calls the API. */
  baseUrl: string | null;
  token: string | null;
}

export const IMPORT_NOTES_USAGE =
  'Usage: pnpm import:notes <file> --deck <slug> [--format lines|markdown|csv] [--label <text>] [--dry-run]';

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
    },
  });
  const file = positionals[0];
  if (!file || !values.deck) throw new Error(IMPORT_NOTES_USAGE);
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
  return { file, deck: values.deck, format: values.format ?? null, label, dryRun, baseUrl, token };
}

export type Log = (line: string) => void;

const describeRow = (row: ImportRow): string =>
  [
    `line ${row.line}`,
    `[${row.type}]`,
    row.title,
    row.category ? `(${row.category})` : '',
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
): Promise<number> {
  const format = opts.format ?? detectFormat(text, opts.file);
  const parsed = parseNotes(text, format);
  if (parsed.problem) {
    log(parsed.problem);
    return 1;
  }
  const valid = parsed.rows.filter((row) => row.error === null);
  const invalid = parsed.rows.filter((row) => row.error !== null);
  for (const row of invalid) log(`skipped ${describeRow(row)}`);

  if (opts.dryRun || !request) {
    for (const row of valid) log(describeRow(row));
    log(`dry run (${format}): ${valid.length} to import, ${invalid.length} invalid`);
    return invalid.length > 0 ? 1 : 0;
  }

  const categories = (await request<{ data: Category[] }>('GET', `/decks/${opts.deck}/categories`))
    .data;
  const drafts = valid.map((row) => toImportDraft(row, categories));
  const result: ImportRunResult = await importInChunks(
    drafts,
    (rows) =>
      request<ImportRunResult>('POST', `/decks/${opts.deck}/imports`, { label: opts.label, rows }),
    { describeError },
  );
  for (const failure of result.failed) {
    const row = valid[failure.index];
    log(
      `failed ${row ? describeRow(row) : `row ${failure.index + 1}`}: ${failure.detail ?? failure.problem}`,
    );
  }
  log(
    `imported ${result.imported}, duplicates ${result.duplicates}, failed ${result.failed.length}` +
      (invalid.length > 0 ? `, invalid ${invalid.length}` : ''),
  );
  if (result.imported > 0) log(`review them under "${opts.label}" in /d/${opts.deck}/review`);
  return result.failed.length > 0 || invalid.length > 0 ? 1 : 0;
}
