import {
  matchCategory,
  categoriesOf,
  rowError,
  toImportDraft,
  type ImportCategory,
  type ImportRow,
  type ImportRowDraft,
} from '@gobbit/shared/import';
import { IMPORT_ROWS_PER_PREVIEW } from '@gobbit/shared/ingest-constants';

/** D189: a parsed row in the preview; invalid rows start unticked and can't be ticked. */
export type PreviewRow = ImportRow & { key: number; included: boolean };

export type RowEdit = Partial<Pick<ImportRow, 'title' | 'body'>> & { category?: string | null };

/** The label imports are shown under in review (and `?source=`): the file name or this. */
export const PASTED_LABEL = 'Pasted notes';

/** The first part of a card's body for the preview; the full text is in the editor. */
export function bodyExcerpt(body: string, max = 200): string {
  const chars = [...body];
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : body;
}

/** More rows than the daily cap: the file has to be split (T047). */
export const tooManyRows = (count: number): boolean => count > IMPORT_ROWS_PER_PREVIEW;

export function previewRows(rows: readonly ImportRow[]): PreviewRow[] {
  return rows.map((row, key) => ({ ...row, key, included: row.error === null }));
}

/** Applies an edit and re-checks the card limits; a row fixed by the edit is ticked again. */
export function editRow(row: PreviewRow, edit: RowEdit): PreviewRow {
  const { category, ...rest } = edit;
  const next = { ...row, ...rest };
  // Edits the first category only; a second one (US2) is kept.
  if (category !== undefined)
    next.categories = [
      ...categoriesOf(category?.trim() ? category : null),
      ...row.categories.slice(1),
    ];
  const error = rowError(next);
  return { ...next, error, included: error === null && (row.error !== null || row.included) };
}

export function toggleRow(row: PreviewRow): PreviewRow {
  return row.error === null ? { ...row, included: !row.included } : row;
}

/** Ticked, valid rows; the ones "Import N cards" sends, in order. */
export function importableRows(rows: readonly PreviewRow[]): PreviewRow[] {
  return rows.filter((row) => row.included && row.error === null);
}

/** Rows → request drafts; a category matching an existing one is sent by id (D190). */
export function rowsToDrafts(
  rows: readonly PreviewRow[],
  categories: readonly ImportCategory[],
  strict = false,
): ImportRowDraft[] {
  return rows.map((row) => toImportDraft(row, categories, { strict }));
}

/** "existing" when the category maps to one the deck has, "new" when publishing would add it, "refused" when strict. */
export function categoryStatus(
  name: string | null,
  categories: readonly ImportCategory[],
  strict = false,
): 'existing' | 'new' | 'refused' | null {
  if (!name) return null;
  if (matchCategory(name, categories)) return 'existing';
  return strict ? 'refused' : 'new';
}
