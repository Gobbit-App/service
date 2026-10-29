import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { can, type MemberRole } from '@gobbit/shared';
import { categories, itemCategories, items } from '@gobbit/db';

/** True when `role` may see `private` categories (and the cards only they hold). */
export function canSeePrivate(role: MemberRole | null): boolean {
  return role !== null && can(role, 'category.read_private');
}

/**
 * D38: the single category-visibility predicate. Owners/maintainers see everything,
 * editors/readers see shared + public, no role sees public only (Phase 8).
 */
export function visibleCategoriesWhere(role: MemberRole | null): SQL {
  if (canSeePrivate(role)) {
    return sql`true`;
  }
  if (role === null) {
    return eq(categories.visibility, 'public');
  }
  return inArray(categories.visibility, ['shared', 'public']);
}

/** D38: the item (outer `items` row) sits in at least one live category `role` can see. */
export function itemHasVisibleCategory(role: MemberRole | null): SQL {
  return sql`exists (
    select 1 from ${itemCategories}
    inner join ${categories} on ${categories.id} = ${itemCategories.categoryId}
    where ${itemCategories.itemId} = ${items.id}
      and ${categories.deletedAt} is null
      and ${visibleCategoriesWhere(role)}
  )`;
}
