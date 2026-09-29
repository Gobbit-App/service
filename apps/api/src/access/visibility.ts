import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { can, type MemberRole } from '@pb/shared';
import { categories } from '@pb/db';

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
