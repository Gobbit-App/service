import {
  matchCategory,
  rowError,
  toImportDraft,
  type ImportCategory,
  type ImportRow,
  type ImportRowDraft,
} from '@gobbit/shared/import';

/** D189: a parsed row in the preview; invalid rows start unticked and can't be ticked. */
export type PreviewRow = ImportRow & { key: number; included: boolean };

export type RowEdit = Partial<Pick<ImportRow, 'title' | 'body' | 'category'>>;

/** The label imports are shown under in review (and `?source=`): the file name or this. */
export const PASTED_LABEL = 'Pasted notes';

export function previewRows(rows: readonly ImportRow[]): PreviewRow[] {
  return rows.map((row, key) => ({ ...row, key, included: row.error === null }));
}

/** Applies an edit and re-checks the card limits; a row fixed by the edit is ticked again. */
export function editRow(row: PreviewRow, edit: RowEdit): PreviewRow {
  const next = { ...row, ...edit };
  if (edit.category !== undefined) next.category = edit.category?.trim() ? edit.category : null;
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
): ImportRowDraft[] {
  return rows.map((row) => toImportDraft(row, categories));
}

/** "existing" when the category maps to one the deck has, "new" when publishing would add it. */
export function categoryStatus(
  name: string | null,
  categories: readonly ImportCategory[],
): 'existing' | 'new' | null {
  if (!name) return null;
  return matchCategory(name, categories) ? 'existing' : 'new';
}
