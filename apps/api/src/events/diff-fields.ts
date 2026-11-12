import { isDeepStrictEqual } from 'node:util';
import type { ItemRow } from '@gobbit/db';
import { itemEventFields, type ItemEventField } from '@gobbit/shared';

/** The card fields D186 compares, with categories as ids. */
export type ItemFields = Pick<
  ItemRow,
  | 'title'
  | 'body'
  | 'payload'
  | 'sourceUrl'
  | 'entities'
  | 'verifiedAt'
  | 'type'
  | 'status'
  | 'cover'
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
    cover: row.cover,
    categoryIds,
  };
}

/** D369: the payload keys behind each event sub-field group. */
const EVENT_FIELD_GROUPS = {
  when: ['start', 'end', 'allDay', 'timeZone'],
  location: ['location'],
  link: ['url', 'preview'],
  notify: ['notify'],
} as const satisfies Partial<Record<ItemEventField, readonly string[]>>;

type EventFieldGroup = keyof typeof EVENT_FIELD_GROUPS;

function isEventGroup(field: ItemEventField): field is EventFieldGroup {
  return field in EVENT_FIELD_GROUPS;
}

function payloadPart(fields: ItemFields, keys: readonly string[]): unknown[] {
  const payload = (fields.payload ?? {}) as Record<string, unknown>;
  return keys.map((key) => payload[key]);
}

function sameValue(field: ItemEventField, before: ItemFields, after: ItemFields): boolean {
  const isEvent = after.type === 'event';
  if (isEventGroup(field)) {
    if (!isEvent) return true;
    const keys = EVENT_FIELD_GROUPS[field];
    return isDeepStrictEqual(payloadPart(before, keys), payloadPart(after, keys));
  }
  // D369: an event's payload change is named by its groups instead.
  if (field === 'payload' && isEvent) return true;
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
    case 'cover':
      return (before.cover?.publicId ?? null) === (after.cover?.publicId ?? null);
    default:
      return isDeepStrictEqual(before[field], after[field]);
  }
}

/**
 * D187: the names of the fields that differ, in `itemEventFields` order; categories compare as
 * sets and JSON fields by value (key order ignored). `[]` = a no-op save (no event). An event names
 * `when`/`location`/`link`/`notify` instead of `payload` (D369).
 */
export function diffFields(before: ItemFields, after: ItemFields): ItemEventField[] {
  return itemEventFields.filter((field) => !sameValue(field, before, after));
}
