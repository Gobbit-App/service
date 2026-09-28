import { eq, isNull, asc, and, inArray, sql } from 'drizzle-orm';
import type { CategoryRow, Db } from '@pb/db';
import { categories } from '@pb/db';
import type { CategoryVisibility } from '@pb/shared';

export function createCategoriesRepo(db: Db) {
  return {
    async listByPocketbook(pocketbookId: string): Promise<CategoryRow[]> {
      return db
        .select()
        .from(categories)
        .where(and(eq(categories.pocketbookId, pocketbookId), isNull(categories.deletedAt)))
        .orderBy(asc(categories.position), asc(categories.name));
    },

    async findBySlug(pocketbookId: string, slug: string): Promise<CategoryRow | null> {
      const result = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.pocketbookId, pocketbookId),
            eq(categories.slug, slug),
            isNull(categories.deletedAt),
          ),
        )
        .limit(1);
      return result[0] ?? null;
    },

    async findDefault(pocketbookId: string): Promise<CategoryRow | null> {
      const result = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.pocketbookId, pocketbookId),
            eq(categories.isDefault, true),
            isNull(categories.deletedAt),
          ),
        )
        .limit(1);
      return result[0] ?? null;
    },

    async findExistingIds(pocketbookId: string, ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];

      const result = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.pocketbookId, pocketbookId),
            inArray(categories.id, ids),
            isNull(categories.deletedAt),
          ),
        );
      return result.map((r) => r.id);
    },

    async maxPosition(pocketbookId: string): Promise<number> {
      const result = await db
        .select({
          max: sql<number>`coalesce(max(${categories.position}), -1)`,
        })
        .from(categories)
        .where(and(eq(categories.pocketbookId, pocketbookId), isNull(categories.deletedAt)));
      return Number(result[0]?.max ?? -1);
    },

    async create(v: {
      pocketbookId: string;
      slug: string;
      name: string;
      visibility: CategoryVisibility;
      position: number;
    }): Promise<CategoryRow> {
      const result = await db
        .insert(categories)
        .values({
          pocketbookId: v.pocketbookId,
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
