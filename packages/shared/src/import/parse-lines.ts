import type { ImportRow } from './constants';
import { noteRow } from './note-row';

/** A leading list marker people type in plain notes: `-`, `*`, `•`, `1.`, `1)`. */
export const LIST_MARKER = /^\s*(?:[-*+•·]|\d+[.)])\s+/u;

/** D189 lines: one card per non-empty line; separator lines are skipped. */
export function parseLines(text: string, category: string | null = null): ImportRow[] {
  return text.split(/\r?\n/).flatMap((raw, i) => {
    const row = noteRow(raw.replace(LIST_MARKER, ''), { line: i + 1, category });
    return row ? [row] : [];
  });
}
