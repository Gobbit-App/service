import type { ImportDraft } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import { parseDirectDraft, suggestedCategory, type DirectDraft } from '../services/ingest.service';

/** D190: an import row as a direct draft; a link row's `sourceUrl` is also its payload URL. */
export function importRowDraft(row: ImportDraft): DirectDraft {
  return {
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.type === 'link' ? { url: row.sourceUrl! } : {},
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.categoryIds ? { categoryIds: row.categoryIds } : {}),
    ...(row.newCategory ? { newCategory: row.newCategory } : {}),
  } as DirectDraft;
}

/**
 * D190: the whole request is refused when a row fails the card rules, so nothing is half
 * imported because of a bad row. The problem names the row index.
 */
export function assertImportRows(rows: readonly ImportDraft[]): DirectDraft[] {
  return rows.map((row, index) => {
    const draft = importRowDraft(row);
    try {
      parseDirectDraft(draft);
      suggestedCategory(draft.newCategory);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      throw new HttpError(
        err.status,
        err.type,
        err.title,
        `Row ${index}: ${err.detail ?? err.title}`,
      );
    }
    return draft;
  });
}
