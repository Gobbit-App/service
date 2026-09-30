import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { DeckKind, MemberRole } from '@pb/shared';
import { decks, memberships, type DeckRow, type Db } from '@pb/db';

export function createDecksRepo(db: Db) {
  async function listByOwner(accountId: string): Promise<DeckRow[]> {
    return db
      .select()
      .from(decks)
      .where(and(eq(decks.ownerAccountId, accountId), isNull(decks.deletedAt)))
      .orderBy(decks.createdAt, decks.id);
  }

  return {
    listByOwner,

    /** D33: decks the user's account owns (implicit owner) ∪ decks with an accepted membership. */
    async listForUser(
      userId: string,
      accountId: string,
    ): Promise<{ deck: DeckRow; role: MemberRole }[]> {
      const owned = await listByOwner(accountId);
      const shared = await db
        .select({ deck: decks, role: memberships.role })
        .from(memberships)
        .innerJoin(decks, eq(decks.id, memberships.deckId))
        .where(
          and(
            eq(memberships.userId, userId),
            isNotNull(memberships.acceptedAt),
            isNull(memberships.deletedAt),
            isNull(decks.deletedAt),
            ne(decks.ownerAccountId, accountId),
          ),
        );
      return [...owned.map((deck) => ({ deck, role: 'owner' as const })), ...shared].sort(
        (a, b) =>
          a.deck.createdAt.getTime() - b.deck.createdAt.getTime() ||
          a.deck.id.localeCompare(b.deck.id),
      );
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

    /** D50: soft delete; the partial unique index frees the slug for reuse. */
    async softDelete(id: string, now: Date = new Date()): Promise<boolean> {
      const rows = await db
        .update(decks)
        .set({ deletedAt: now })
        .where(and(eq(decks.id, id), isNull(decks.deletedAt)))
        .returning({ id: decks.id });
      return rows.length > 0;
    },
  };
}

export type DecksRepo = ReturnType<typeof createDecksRepo>;
