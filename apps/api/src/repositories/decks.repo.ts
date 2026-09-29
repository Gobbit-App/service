import { and, eq, isNull } from 'drizzle-orm';
import type { DeckKind } from '@pb/shared';
import { decks, type DeckRow, type Db } from '@pb/db';

export function createDecksRepo(db: Db) {
  return {
    async listByOwner(accountId: string): Promise<DeckRow[]> {
      return db
        .select()
        .from(decks)
        .where(and(eq(decks.ownerAccountId, accountId), isNull(decks.deletedAt)))
        .orderBy(decks.createdAt, decks.id);
    },

    async findById(id: string): Promise<DeckRow | null> {
      const [row] = await db
        .select()
        .from(decks)
        .where(and(eq(decks.id, id), isNull(decks.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findBySlug(slug: string): Promise<DeckRow | null> {
      const [row] = await db
        .select()
        .from(decks)
        .where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async create(v: {
      kind: DeckKind;
      slug: string;
      name: string;
      isPublic: boolean;
      ownerAccountId: string;
    }): Promise<DeckRow> {
      const [row] = await db.insert(decks).values(v).returning();
      return row;
    },

    async update(
      id: string,
      patch: { name?: string; slug?: string; isPublic?: boolean },
    ): Promise<DeckRow> {
      const [row] = await db.update(decks).set(patch).where(eq(decks.id, id)).returning();
      if (!row) {
        throw new Error(`Deck ${id} not found`);
      }
      return row;
    },
  };
}

export type DecksRepo = ReturnType<typeof createDecksRepo>;
