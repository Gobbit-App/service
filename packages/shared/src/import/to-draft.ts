import type { ImportRow } from './constants';

export interface ImportCategory {
  id: string;
  name: string;
  slug: string;
}

/** The body of one `POST /decks/{id}/imports` row (`importDraftSchema`). */
export interface ImportRowDraft {
  type: 'text' | 'link';
  title: string;
  body: string;
  sourceUrl?: string;
  categoryIds?: string[];
  newCategory?: string;
  unmatched?: string[];
}

export const normalise = (s: string): string =>
  s.trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '-');

/** A category name → an existing category (by name or slug), else null. */
export function matchCategory(
  name: string,
  categories: readonly ImportCategory[],
): ImportCategory | null {
  const key = normalise(name);
  return categories.find((c) => normalise(c.name) === key || c.slug === key) ?? null;
}

/** Always a draft (T035): categories map to ids; unmatched names become `newCategory` (one, non-strict) or `unmatched`. */
export function toImportDraft(
  row: ImportRow,
  categories: readonly ImportCategory[],
  opts: { strict?: boolean } = {},
): ImportRowDraft {
  const draft: ImportRowDraft = {
    type: row.type === 'media' ? 'text' : row.type,
    title: row.title.trim(),
    body: row.body,
  };
  if (row.sourceUrl) draft.sourceUrl = row.sourceUrl;
  const ids = new Set<string>();
  const unmatched = new Map<string, string>();
  for (const raw of row.categories) {
    const name = raw.trim();
    if (!name) continue;
    const found = matchCategory(name, categories);
    if (found) ids.add(found.id);
    else if (!unmatched.has(normalise(name))) unmatched.set(normalise(name), name);
  }
  if (ids.size) draft.categoryIds = [...ids];
  const names = [...unmatched.values()];
  if (names.length === 1 && !opts.strict) draft.newCategory = names[0];
  else if (names.length) draft.unmatched = names;
  return draft;
}
