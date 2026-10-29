import type { CategoryRow, ItemRow } from '@gobbit/db';
import type { PublicItem } from '@gobbit/shared';

export type PublicCategorySource = Pick<CategoryRow, 'slug' | 'name' | 'visibility'>;

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
    payload: row.payload,
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
