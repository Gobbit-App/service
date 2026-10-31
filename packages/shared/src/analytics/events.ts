import { itemTypes, type ItemType } from '../enums';

/** D248: the only custom events the app sends. */
export const contentEventNames = [
  'card-created',
  'card-edited',
  'card-deleted',
  'card-shared',
] as const;
export type ContentEventName = (typeof contentEventNames)[number];

/** D248: where the action happened; a fixed label, never free text. */
export const contentChannels = [
  'editor',
  'review',
  'bulk-publish',
  'import',
  'archive',
  'restore',
  'undelete',
  'card-menu',
  'share-sheet',
  'copy-link',
  'share-target',
] as const;
export type ContentChannel = (typeof contentChannels)[number];

/** D248: the whole allow-list of event data; ids only, a count for bulk actions. */
export type ContentEventProps = {
  deckId?: string;
  itemId?: string;
  count?: number;
  type?: ItemType;
  channel: ContentChannel;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export function isContentEventName(value: unknown): value is ContentEventName {
  return isOneOf(contentEventNames, value);
}

/**
 * D246: keeps only allow-listed keys with valid values (UUIDs, a positive integer count, fixed
 * labels); anything else is dropped. Returns null without a valid channel.
 */
export function cleanEventData(data: unknown): ContentEventProps | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!isOneOf(contentChannels, d.channel)) return null;
  const clean: ContentEventProps = { channel: d.channel };
  if (typeof d.deckId === 'string' && UUID.test(d.deckId)) clean.deckId = d.deckId;
  if (typeof d.itemId === 'string' && UUID.test(d.itemId)) clean.itemId = d.itemId;
  if (typeof d.count === 'number' && Number.isInteger(d.count) && d.count > 0) {
    clean.count = d.count;
  }
  if (isOneOf(itemTypes, d.type)) clean.type = d.type;
  return clean;
}

export function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
