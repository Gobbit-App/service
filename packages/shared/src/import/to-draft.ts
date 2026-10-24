import type { ImportRow } from './constants';

export interface ImportCategory {
  id: string;
  name: string;
  slug: string;
}

/** The body of one `POST /decks/{id}/imports` row (`importDraftSchema`). */
export interface ImportRowDraft {
  type: ImportRow['type'];
  title: string;
  body: string;
  sourceUrl?: string;
  categoryIds?: string[];
  newCategory?: string;
}

const normalise = (s: string): string => s.trim().toLocaleLowerCase().replace(/\s+/g, '-');

/** A category name → an existing category (by name or slug), else null. */
export function matchCategory(
  name: string,
  categories: readonly ImportCategory[],
): ImportCategory | null {
  const key = normalise(name);
  return categories.find((c) => normalise(c.name) === key || c.slug === key) ?? null;
}

/** D190: a valid row → its draft; the category maps to an existing id, else `newCategory`. */
export function toImportDraft(
  row: ImportRow,
  categories: readonly ImportCategory[],
): ImportRowDraft {
  const draft: ImportRowDraft = { type: row.type, title: row.title.trim(), body: row.body };
  if (row.sourceUrl) draft.sourceUrl = row.sourceUrl;
  if (row.category) {
    const found = matchCategory(row.category, categories);
    if (found) draft.categoryIds = [found.id];
    else draft.newCategory = row.category.trim();
  }
  return draft;
}
