import { and, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { itemCategories, items, type Db, type ItemRow } from '@pb/db';
import type { CursorData, ItemStatus, ItemType, SourceKind } from '@pb/shared';

export function createItemsRepo(db: Db) {
  return {
    async create(
      v: {
        deckId: string;
        type: ItemType;
        status: ItemStatus;
        title: string;
        body: string;
        payload: Record<string, unknown>;
        sourceUrl: string | null;
        sourceKind: SourceKind;
        verifiedAt: Date | null;
        createdBy: string;
      },
      categoryIds: string[],
    ): Promise<ItemRow> {
      return await db.transaction(async (tx) => {
        const [item] = await tx.insert(items).values(v).returning();

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
        .select()
        .from(items)
        .where(and(eq(items.id, id), isNull(items.deletedAt)))
        .limit(1);

      return item ?? null;
    },

    async list(q: {
      deckId: string;
      status: ItemStatus;
      type?: ItemType;
      categoryId?: string;
      cursor?: CursorData;
      limit: number;
    }): Promise<ItemRow[]> {
      const conditions = [
        eq(items.deckId, q.deckId),
        eq(items.status, q.status),
        isNull(items.deletedAt),
      ];

      if (q.type) {
        conditions.push(eq(items.type, q.type));
      }

      if (q.categoryId) {
        conditions.push(
          exists(
            db
              .select()
              .from(itemCategories)
              .where(
                and(
                  eq(itemCategories.itemId, items.id),
                  eq(itemCategories.categoryId, q.categoryId),
                ),
              ),
          ),
        );
      }

      if (q.cursor) {
        conditions.push(
          sql`(${items.createdAt}, ${items.id}) < (${q.cursor.createdAt}::timestamptz, ${q.cursor.id}::uuid)`,
        );
      }

      return await db
        .select()
        .from(items)
        .where(and(...conditions))
        .orderBy(desc(items.createdAt), desc(items.id))
        .limit(q.limit);
    },

    async update(
      id: string,
      patch: Partial<{
        body: string;
        payload: Record<string, unknown>;
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

        const [updatedItem] = await tx.select().from(items).where(eq(items.id, id)).limit(1);

        return updatedItem!;
      });
    },

    async softDelete(id: string): Promise<void> {
      await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, id));
    },

    async categoryIdsFor(itemIds: string[]): Promise<Map<string, string[]>> {
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
        .where(inArray(itemCategories.itemId, itemIds))
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
