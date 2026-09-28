import { and, eq, isNull } from 'drizzle-orm';
import type { PocketbookKind } from '@pb/shared';
import { pocketbooks, type PocketbookRow, type Db } from '@pb/db';

export function createPocketbooksRepo(db: Db) {
  return {
    async listByOwner(accountId: string): Promise<PocketbookRow[]> {
      return db
        .select()
        .from(pocketbooks)
        .where(and(eq(pocketbooks.ownerAccountId, accountId), isNull(pocketbooks.deletedAt)))
        .orderBy(pocketbooks.createdAt, pocketbooks.id);
    },

    async findById(id: string): Promise<PocketbookRow | null> {
      const [row] = await db
        .select()
        .from(pocketbooks)
        .where(and(eq(pocketbooks.id, id), isNull(pocketbooks.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findBySlug(slug: string): Promise<PocketbookRow | null> {
      const [row] = await db
        .select()
        .from(pocketbooks)
        .where(and(eq(pocketbooks.slug, slug), isNull(pocketbooks.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async create(v: {
      kind: PocketbookKind;
      slug: string;
      name: string;
      isPublic: boolean;
      ownerAccountId: string;
    }): Promise<PocketbookRow> {
      const [row] = await db.insert(pocketbooks).values(v).returning();
      return row;
    },

    async update(
      id: string,
      patch: { name?: string; slug?: string; isPublic?: boolean },
    ): Promise<PocketbookRow> {
      const [row] = await db
        .update(pocketbooks)
        .set(patch)
        .where(eq(pocketbooks.id, id))
        .returning();
      if (!row) {
        throw new Error(`Pocketbook ${id} not found`);
      }
      return row;
    },
  };
}

export type PocketbooksRepo = ReturnType<typeof createPocketbooksRepo>;
