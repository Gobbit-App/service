import { isDeepStrictEqual } from 'node:util';
import type { ItemRow } from '@pb/db';
import { itemEventFields, type ItemEventField } from '@pb/shared';

/** The card fields D186 compares, with categories as ids. */
export type ItemFields = Pick<
  ItemRow,
  'title' | 'body' | 'payload' | 'sourceUrl' | 'entities' | 'verifiedAt' | 'type' | 'status'
> & { categoryIds: readonly string[] };

export function itemFields(row: ItemRow, categoryIds: readonly string[]): ItemFields {
  return {
    title: row.title,
    body: row.body,
    payload: row.payload,
    sourceUrl: row.sourceUrl,
    entities: row.entities,
    verifiedAt: row.verifiedAt,
    type: row.type,
    status: row.status,
    categoryIds,
  };
}

function sameValue(field: ItemEventField, before: ItemFields, after: ItemFields): boolean {
  switch (field) {
    case 'categories': {
      const a = new Set(before.categoryIds);
      const b = new Set(after.categoryIds);
      return a.size === b.size && [...a].every((id) => b.has(id));
    }
    case 'verifiedAt':
      return (before.verifiedAt?.getTime() ?? null) === (after.verifiedAt?.getTime() ?? null);
    case 'entities':
      return isDeepStrictEqual(before.entities ?? {}, after.entities ?? {});
    default:
      return isDeepStrictEqual(before[field], after[field]);
  }
}

/**
 * D187: the names of the fields that differ, in `itemEventFields` order; categories compare as
 * sets and JSON fields by value (key order ignored). `[]` = a no-op save (no event).
 */
export function diffFields(before: ItemFields, after: ItemFields): ItemEventField[] {
  return itemEventFields.filter((field) => !sameValue(field, before, after));
}
