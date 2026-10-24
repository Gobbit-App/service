import Papa from 'papaparse';
import type { ImportParseResult, ImportRow } from './constants';
import { findUrl, noteRow, titleForUrl, withError } from './note-row';

type CsvRecord = Record<string, string | undefined>;

const cell = (record: CsvRecord, column: 'title' | 'body' | 'category' | 'url'): string =>
  (record[column] ?? '').replace(/\r\n?/g, '\n').trim();

/** One CSV record → a row: a `url` makes a link card; without a title the body is split. */
function recordRow(record: CsvRecord, line: number): ImportRow | null {
  const title = cell(record, 'title');
  const body = cell(record, 'body');
  const category = cell(record, 'category') || null;
  const rawUrl = cell(record, 'url');
  if (!title && !body && !rawUrl) return null;

  const url = rawUrl ? findUrl(rawUrl) : null;
  if (rawUrl && !url) {
    return {
      line,
      type: 'text',
      title: title || body,
      body,
      sourceUrl: null,
      category,
      error: 'The url is not an http(s) address',
    };
  }
  if (url) {
    return withError({
      line,
      type: 'link',
      title: title || titleForUrl(url),
      body,
      sourceUrl: url,
      category,
    });
  }
  if (!title) return noteRow(body, { line, category });
  return withError({ line, type: 'text', title, body, sourceUrl: findUrl(body), category });
}

/**
 * D189 CSV: a header row with `title`, `body`, `category`, `url` (any case, extra columns
 * ignored); quoted commas and line breaks are handled by papaparse. Lines are spreadsheet row
 * numbers (the header is row 1).
 */
export function parseCsv(text: string): ImportParseResult {
  const parsed = Papa.parse<CsvRecord>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes('title') && !fields.includes('body')) {
    return { rows: [], problem: 'The first CSV row needs a title or body column' };
  }
  const broken = new Set(parsed.errors.filter((e) => e.type === 'Quotes').map((e) => e.row));
  const rows = parsed.data.flatMap((record, i) => {
    const row = recordRow(record, i + 2);
    if (!row) return [];
    return [broken.has(i) ? { ...row, error: 'A quote in this row is not closed' } : row];
  });
  return { rows, problem: null };
}
