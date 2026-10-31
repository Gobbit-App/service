import { eq, isNull, asc, and, inArray, sql } from 'drizzle-orm';
import type { CategoryRow, DbExecutor } from '@gobbit/db';
import { categories, itemCategories, items } from '@gobbit/db';
import type { CategoryVisibility, MemberRole } from '@gobbit/shared';
import { visibleCategoriesWhere } from '../access/visibility';

export function createCategoriesRepo(db: DbExecutor) {
  return {
    /** D38: only the categories `role` may see. */
    async listByDeck(deckId: string, role: MemberRole | null): Promise<CategoryRow[]> {
      return db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.deckId, deckId),
            isNull(categories.deletedAt),
            visibleCategoriesWhere(role),
          ),
        )
        .orderBy(asc(categories.position), asc(categories.name));
    },

    /** D38: an invisible slug is indistinguishable from a missing one. */
    async findBySlug(
      deckId: string,
      slug: string,
      role: MemberRole | null,
    ): Promise<CategoryRow | null> {
      const result = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.deckId, deckId),
            eq(categories.slug, slug),
            isNull(categories.deletedAt),
            visibleCategoriesWhere(role),
          ),
        )
        .limit(1);
      return result[0] ?? null;
    },

    async findDefault(deckId: string): Promise<CategoryRow | null> {
      const result = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.deckId, deckId),
            eq(categories.isDefault, true),
            isNull(categories.deletedAt),
          ),
        )
        .limit(1);
      return result[0] ?? null;
    },

    /** D38: ids `role` can't see are reported as unknown by the caller. */
    async findExistingIds(
      deckId: string,
      ids: string[],
      role: MemberRole | null,
    ): Promise<string[]> {
      if (ids.length === 0) return [];

      const result = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.deckId, deckId),
            inArray(categories.id, ids),
            isNull(categories.deletedAt),
            visibleCategoriesWhere(role),
          ),
        );
      return result.map((r) => r.id);
    },

    async maxPosition(deckId: string): Promise<number> {
      const result = await db
        .select({
          max: sql<number>`coalesce(max(${categories.position}), -1)`,
        })
        .from(categories)
        .where(and(eq(categories.deckId, deckId), isNull(categories.deletedAt)));
      return Number(result[0]?.max ?? -1);
    },

    /** D174: published, live cards per category `role` can see (categories with none are absent). */
    async countPublished(deckId: string, role: MemberRole | null): Promise<Map<string, number>> {
      const rows = await db
        .select({ categoryId: categories.id, n: sql<number>`count(*)::int` })
        .from(categories)
        .innerJoin(itemCategories, eq(itemCategories.categoryId, categories.id))
        .innerJoin(items, eq(items.id, itemCategories.itemId))
        .where(
          and(
            eq(categories.deckId, deckId),
            isNull(categories.deletedAt),
            visibleCategoriesWhere(role),
            eq(items.status, 'published'),
            isNull(items.deletedAt),
          ),
        )
        .groupBy(categories.id);
      return new Map(rows.map((r) => [r.categoryId, Number(r.n)]));
    },

    /** D176: rename or change visibility; the slug never changes. */
    async update(
      id: string,
      patch: { name?: string; visibility?: CategoryVisibility },
    ): Promise<CategoryRow> {
      const result = await db
        .update(categories)
        .set(patch)
        .where(eq(categories.id, id))
        .returning();
      return result[0]!;
    },

    async create(v: {
      deckId: string;
      slug: string;
      name: string;
      visibility: CategoryVisibility;
      position: number;
    }): Promise<CategoryRow> {
      const result = await db
        .insert(categories)
        .values({
          deckId: v.deckId,
          slug: v.slug,
          name: v.name,
          visibility: v.visibility,
          position: v.position,
        })
        .returning();
      return result[0]!;
    },
  };
}

export type CategoriesRepo = ReturnType<typeof createCategoriesRepo>;
