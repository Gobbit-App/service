import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  categories,
  favorites,
  itemCategories,
  itemColumns,
  items,
  type DbExecutor,
  type ItemRow,
} from '@pb/db';
import type {
  CursorData,
  Entities,
  ItemStatus,
  ItemType,
  MemberRole,
  SourceKind,
} from '@pb/shared';
import {
  canSeePrivate,
  itemHasVisibleCategory,
  visibleCategoriesWhere,
} from '../access/visibility';

/** Filters shared by the live list and the deleted listing (D132). */
interface ItemListFilters {
  role: MemberRole;
  deckId: string;
  type?: ItemType;
  categoryId?: string;
  /** Only items this user has favorited (P3 favorites view). */
  favoriteOf?: string;
}

export function createItemsRepo(db: DbExecutor) {
  function filterConditions(q: ItemListFilters): SQL[] {
    const conditions: SQL[] = [eq(items.deckId, q.deckId)];

    if (q.type) {
      conditions.push(eq(items.type, q.type));
    }

    if (!canSeePrivate(q.role)) {
      conditions.push(itemHasVisibleCategory(q.role));
    }

    if (q.categoryId) {
      conditions.push(
        exists(
          db
            .select()
            .from(itemCategories)
            .where(
              and(eq(itemCategories.itemId, items.id), eq(itemCategories.categoryId, q.categoryId)),
            ),
        ),
      );
    }

    if (q.favoriteOf) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(favorites)
            .where(and(eq(favorites.itemId, items.id), eq(favorites.userId, q.favoriteOf))),
        ),
      );
    }

    return conditions;
  }

  return {
    async create(
      v: {
        deckId: string;
        type: ItemType;
        status: ItemStatus;
        title: string;
        body: string;
        payload: Record<string, unknown>;
        entities?: Entities;
        sourceUrl: string | null;
        sourceKind: SourceKind;
        verifiedAt: Date | null;
        createdBy: string;
      },
      categoryIds: string[],
    ): Promise<ItemRow> {
      return await db.transaction(async (tx) => {
        const [item] = await tx.insert(items).values(v).returning(itemColumns);

        if (categoryIds.length > 0) {
          await tx.insert(itemCategories).values(
            categoryIds.map((categoryId) => ({
              categoryId,
              itemId: item.id,
              deckId: v.deckId,
            })),
          );
        }

        return item;
      });
    },

    async findById(id: string): Promise<ItemRow | null> {
      const [item] = await db
        .select(itemColumns)
        .from(items)
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .limit(1);

      return item ?? null;
    },

    /** D38: false when every category of the item is hidden from `role` (→ 404). */
    async isVisibleTo(id: string, role: MemberRole): Promise<boolean> {
      if (canSeePrivate(role)) return true;
      const [row] = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, id), itemHasVisibleCategory(role)))
        .limit(1);
      return row !== undefined;
    },

    async list(
      q: ItemListFilters & { status: ItemStatus; cursor?: CursorData; limit: number },
    ): Promise<ItemRow[]> {
      const conditions = [
        ...filterConditions(q),
        eq(items.status, q.status),
        isNull(items.deletedAt),
      ];

      if (q.cursor) {
        conditions.push(
          sql`(${items.createdAt}, ${items.id}) < (${q.cursor.createdAt}::timestamptz, ${q.cursor.id}::uuid)`,
        );
      }

      return await db
        .select(itemColumns)
        .from(items)
        .where(and(...conditions))
        .orderBy(desc(items.createdAt), desc(items.id))
        .limit(q.limit);
    },

    /** D132: a row even when soft-deleted (undelete); callers decide what a deleted row means. */
    async findByIdIncludingDeleted(id: string): Promise<ItemRow | null> {
      const [item] = await db.select(itemColumns).from(items).where(eq(items.id, id)).limit(1);
      return item ?? null;
    },

    /**
     * D132: the deck's deleted cards since `deletedSince`, proposals excluded (review-owned),
     * newest deleted first. The cursor is `(deletedAt, id)` of the last row of the previous page.
     */
    async listDeleted(
      q: ItemListFilters & {
        deletedSince: Date;
        after?: { deletedAt: string; id: string };
        limit: number;
      },
    ): Promise<ItemRow[]> {
      const conditions = [
        ...filterConditions(q),
        isNotNull(items.deletedAt),
        gte(items.deletedAt, q.deletedSince),
        ne(items.status, 'proposed'),
      ];

      if (q.after) {
        conditions.push(
          sql`(${items.deletedAt}, ${items.id}) < (${q.after.deletedAt}::timestamptz, ${q.after.id}::uuid)`,
        );
      }

      return await db
        .select(itemColumns)
        .from(items)
        .where(and(...conditions))
        .orderBy(desc(items.deletedAt), desc(items.id))
        .limit(q.limit);
    },

    /** D132: clears `deleted_at`; the deferred D95 trigger re-checks the published-has-category rule. */
    async undelete(id: string): Promise<ItemRow> {
      const [item] = await db
        .update(items)
        .set({ deletedAt: null })
        .where(eq(items.id, id))
        .returning(itemColumns);
      return item!;
    },

    /** D132: hard-deletes cards deleted before `cutoff`; FKs cascade or set null. Returns the count. */
    async purgeDeletedBefore(cutoff: Date): Promise<number> {
      const removed = await db
        .delete(items)
        .where(and(isNotNull(items.deletedAt), lt(items.deletedAt, cutoff)))
        .returning({ id: items.id });
      return removed.length;
    },

    async update(
      id: string,
      patch: Partial<{
        body: string;
        payload: Record<string, unknown>;
        entities: Entities;
        sourceUrl: string | null;
        status: ItemStatus;
        title: string;
        verifiedAt: Date | null;
      }>,
      categoryIds?: string[],
    ): Promise<ItemRow> {
      return await db.transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
          await tx.update(items).set(patch).where(eq(items.id, id));
        }

        if (categoryIds !== undefined) {
          const [item] = await tx
            .select({ deckId: items.deckId })
            .from(items)
            .where(eq(items.id, id))
            .limit(1);

          if (item) {
            await tx.delete(itemCategories).where(eq(itemCategories.itemId, id));

            if (categoryIds.length > 0) {
              await tx.insert(itemCategories).values(
                categoryIds.map((categoryId) => ({
                  categoryId,
                  itemId: id,
                  deckId: item.deckId,
                })),
              );
            }
          }
        }

        const [updatedItem] = await tx
          .select(itemColumns)
          .from(items)
          .where(eq(items.id, id))
          .limit(1);

        return updatedItem!;
      });
    },

    /** Live items in the deck with `status` (the review pill counts proposals, D107). */
    async countByStatus(deckId: string, status: ItemStatus): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(items)
        .where(and(eq(items.deckId, deckId), eq(items.status, status), isNull(items.deletedAt)));
      return row?.n ?? 0;
    },

    /** ADR-005 soft delete; `at` comes from the service clock so the D132 undo window is testable. */
    async softDelete(id: string, at: Date = new Date()): Promise<void> {
      await db.update(items).set({ deletedAt: at }).where(eq(items.id, id));
    },

    /** D38: only the category ids `role` can see, so private ids never leak via a shared card. */
    async categoryIdsFor(itemIds: string[], role: MemberRole): Promise<Map<string, string[]>> {
      const result = new Map<string, string[]>();

      for (const id of itemIds) {
        result.set(id, []);
      }

      if (itemIds.length === 0) {
        return result;
      }

      const rows = await db
        .select({
          categoryId: itemCategories.categoryId,
          itemId: itemCategories.itemId,
        })
        .from(itemCategories)
        .innerJoin(categories, eq(categories.id, itemCategories.categoryId))
        .where(
          and(
            inArray(itemCategories.itemId, itemIds),
            isNull(categories.deletedAt),
            visibleCategoriesWhere(role),
          ),
        )
        .orderBy(itemCategories.createdAt, itemCategories.categoryId);

      for (const row of rows) {
        const categoryIds = result.get(row.itemId);
        if (categoryIds) {
          categoryIds.push(row.categoryId);
        }
      }

      return result;
    },
  };
}

export type ItemsRepo = ReturnType<typeof createItemsRepo>;
