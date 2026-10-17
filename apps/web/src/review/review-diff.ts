import type { Entities, Item } from '@pb/shared';

export type DiffField = 'title' | 'body' | 'url' | 'sourceUrl' | 'entities';

export type FieldChange = {
  field: DiffField;
  label: string;
  before: string;
  after: string;
};

const ENTITY_ORDER: (keyof Entities)[] = [
  'phones',
  'addresses',
  'hours',
  'prices',
  'dates',
  'people',
  'urls',
];

/** Every entity value in a stable order, one string (for a field-level comparison). */
export function entitiesText(entities: Entities | undefined): string {
  if (!entities) return '';
  return ENTITY_ORDER.flatMap((kind) => entities[kind] ?? []).join(', ');
}

function linkUrl(item: Pick<Item, 'payload'>): string {
  const url = item.payload['url'];
  return typeof url === 'string' ? url : '';
}

/**
 * D106: what "Apply update" would change on the target, field by field (client-side, fields only).
 * Unchanged fields are omitted; an empty list means the proposal matches the target.
 */
export function reviewDiff(
  proposal: Pick<Item, 'title' | 'body' | 'payload' | 'sourceUrl' | 'entities'>,
  target: Pick<Item, 'title' | 'body' | 'payload' | 'sourceUrl' | 'entities'>,
): FieldChange[] {
  const fields: [DiffField, string, string, string][] = [
    ['title', 'Title', target.title, proposal.title],
    ['body', 'Text', target.body, proposal.body],
    ['url', 'Link', linkUrl(target), linkUrl(proposal)],
    // The server keeps the target's source when the proposal has none.
    ['sourceUrl', 'Source', target.sourceUrl ?? '', proposal.sourceUrl ?? target.sourceUrl ?? ''],
    ['entities', 'Details', entitiesText(target.entities), entitiesText(proposal.entities)],
  ];
  return fields
    .filter(([, , before, after]) => before.trim() !== after.trim())
    .map(([field, label, before, after]) => ({ field, label, before, after }));
}
