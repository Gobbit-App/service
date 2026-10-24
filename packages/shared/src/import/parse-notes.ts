import type { ImportFormat, ImportParseResult } from './constants';
import { parseCsv } from './parse-csv';
import { parseLines } from './parse-lines';
import { parseMarkdown } from './parse-markdown';

const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+\S/m;

/** D189: `.csv` → csv; `.md` or a `#` heading line → markdown; else lines. */
export function detectFormat(text: string, fileName?: string | null): ImportFormat {
  const name = fileName?.toLowerCase() ?? '';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return MARKDOWN_HEADING.test(text) ? 'markdown' : 'lines';
}

/** Notes → rows in the given format; deterministic, offline and free (D189). */
export function parseNotes(text: string, format: ImportFormat): ImportParseResult {
  if (format === 'csv') return parseCsv(text);
  const rows = format === 'markdown' ? parseMarkdown(text) : parseLines(text);
  return { rows, problem: null };
}
