import type { ItemEvent } from '@pb/shared';

const KIND_LABELS: Record<ItemEvent['kind'], string> = {
  created: 'Added',
  proposed: 'Proposed',
  published: 'Published',
  updated: 'Edited',
  archived: 'Archived',
  restored: 'Restored',
  deleted: 'Deleted',
  undeleted: 'Undeleted',
  discarded: 'Discarded',
  merged: 'Merged a proposal into',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  body: 'text',
  payload: 'details',
  categories: 'categories',
  sourceUrl: 'source',
  entities: 'contacts',
  verifiedAt: 'verified date',
  type: 'type',
  status: 'status',
};

/** D188: the action as a short verb ("Edited", "Archived", …). */
export function eventLabel(kind: ItemEvent['kind']): string {
  return KIND_LABELS[kind];
}

/** D188: the person, or "Former member" for a deleted account. */
export function actorLabel(event: Pick<ItemEvent, 'actor'>): string {
  return event.actor?.displayName ?? 'Former member';
}

/** The changed fields in plain words, e.g. "title, text"; empty when none were recorded. */
export function changesLabel(changes: readonly string[]): string {
  return changes.map((field) => FIELD_LABELS[field] ?? field).join(', ');
}

/** D186: proposals from a share (or later an import) carry a badge. */
export function viaBadge(via: ItemEvent['via']): string | null {
  return via === 'ingest' ? 'via share/import' : null;
}
