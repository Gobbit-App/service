import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { DeckKind, MemberRole } from '@pb/shared';
import { decks, memberships, type DeckRow, type DbExecutor } from '@pb/db';

/** Stored slug of a personal deck (Phase 3B). Internal: clients only ever see `me`. */
export function personalDeckSlug(accountId: string): string {
  return `personal-${accountId}`;
}

export function createDecksRepo(db: DbExecutor) {
  async function listByOwner(accountId: string): Promise<DeckRow[]> {
    return db
      .select()
      .from(decks)
      .where(and(eq(decks.ownerAccountId, accountId), isNull(decks.deletedAt)))
      .orderBy(decks.createdAt, decks.id);
  }

  async function findDefaultForAccount(accountId: string): Promise<DeckRow | null> {
    const [row] = await db
      .select()
      .from(decks)
      .where(
        and(
          eq(decks.ownerAccountId, accountId),
          eq(decks.isDefault, true),
          isNull(decks.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
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

    findDefaultForAccount,

    /**
     * Phase 3B: inserts the personal deck if the account has none. Without a conflict
     * target, so a blocking slug collision also does nothing (the read below then fails
     * and the caller surfaces the error); a caught unique violation would abort the tx.
     */
    async ensureDefault(v: { accountId: string; name: string }): Promise<DeckRow> {
      await db
        .insert(decks)
        .values({
          kind: 'personal',
          slug: personalDeckSlug(v.accountId),
          name: v.name,
          isPublic: false,
          isDefault: true,
          // D192: the owner's own shares land directly in their personal deck.
          autoPublishShares: true,
          ownerAccountId: v.accountId,
        })
        .onConflictDoNothing();
      const row = await findDefaultForAccount(v.accountId);
      if (!row) {
        throw new Error(`Personal deck for account ${v.accountId} could not be ensured`);
      }
      return row;
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
      patch: { name?: string; slug?: string; isPublic?: boolean; autoPublishShares?: boolean },
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
