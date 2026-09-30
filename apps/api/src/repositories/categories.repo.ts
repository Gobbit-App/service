import { eq, isNull, asc, and, inArray, sql } from 'drizzle-orm';
import type { CategoryRow, Db } from '@pb/db';
import { categories } from '@pb/db';
import type { CategoryVisibility, MemberRole } from '@pb/shared';
import { visibleCategoriesWhere } from '../access/visibility';

export function createCategoriesRepo(db: Db) {
  return {
    /** D38: only the categories `role` may see. */
    async listByDeck(deckId: string, role: MemberRole): Promise<CategoryRow[]> {
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
    async findBySlug(deckId: string, slug: string, role: MemberRole): Promise<CategoryRow | null> {
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
    async findExistingIds(deckId: string, ids: string[], role: MemberRole): Promise<string[]> {
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
