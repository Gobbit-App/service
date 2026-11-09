import type { CategoryRow, ItemRow } from '@gobbit/db';
import type { LinkPayload, PublicItem } from '@gobbit/shared';
import { eventPublicPayload } from '@gobbit/shared/event-constants';

export type PublicCategorySource = Pick<CategoryRow, 'slug' | 'name' | 'visibility'>;

/**
 * D350: the image markers are bookkeeping for the snapshot job, never shown to strangers.
 * D365: an event's `notify` (times and audience) never leaves the deck.
 */
function publicPayload(row: ItemRow): ItemRow['payload'] {
  if (row.type === 'event') {
    return eventPublicPayload(
      row.payload as unknown as Parameters<typeof eventPublicPayload>[0],
    ) as unknown as ItemRow['payload'];
  }
  if (row.type !== 'link') return row.payload;
  const payload = row.payload as LinkPayload;
  if (!payload.preview) return payload;
  const { imageLookup: _lookup, imageRemoved: _removed, ...preview } = payload.preview;
  return { ...payload, preview };
}

/**
 * D174: the public card is an allow-list, built field by field so a new `ItemRow` column never
 * reaches strangers by accident. Only the card's `public` categories are listed.
 */
export function toPublicItem(row: ItemRow, categories: PublicCategorySource[]): PublicItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: publicPayload(row),
    entities: row.entities,
    sourceUrl: row.sourceUrl ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    categories: categories
      .filter((c) => c.visibility === 'public')
      .map((c) => ({ slug: c.slug, name: c.name })),
  };
}
