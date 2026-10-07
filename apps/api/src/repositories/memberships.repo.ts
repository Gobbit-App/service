import { and, asc, eq, isNull } from 'drizzle-orm';
import type { MemberRole } from '@pb/shared';
import { memberships, users, type Db, type MembershipRow } from '@pb/db';

export interface MembershipWithUser {
  membership: MembershipRow;
  user: { id: string; email: string; displayName: string };
}

const userColumns = { id: users.id, email: users.email, displayName: users.displayName };

export function createMembershipsRepo(db: Db) {
  return {
    /** The live (not soft-deleted) membership of `userId` on `deckId`, pending or accepted. */
    async findActive(deckId: string, userId: string): Promise<MembershipRow | null> {
      const [row] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.deckId, deckId),
            eq(memberships.userId, userId),
            isNull(memberships.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    /** Includes soft-deleted rows; callers decide what a deleted membership means. */
    async findById(id: string): Promise<MembershipRow | null> {
      const [row] = await db.select().from(memberships).where(eq(memberships.id, id)).limit(1);
      return row ?? null;
    },

    async listByDeck(deckId: string): Promise<MembershipWithUser[]> {
      return db
        .select({ membership: memberships, user: userColumns })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.deckId, deckId),
            isNull(memberships.deletedAt),
            isNull(users.deletedAt),
          ),
        )
        .orderBy(asc(memberships.invitedAt), asc(memberships.id));
    },

    async create(v: {
      deckId: string;
      userId: string;
      role: MemberRole;
      invitedBy: string | null;
      now: Date;
    }): Promise<MembershipRow> {
      const [row] = await db
        .insert(memberships)
        .values({
          deckId: v.deckId,
          userId: v.userId,
          role: v.role,
          invitedBy: v.invitedBy,
          invitedAt: v.now,
        })
        .returning();
      return row;
    },

    /** D37 resend to a pending member: the new invite's role, inviter and time replace the old. */
    async reinvite(
      id: string,
      v: { role: MemberRole; invitedBy: string; now: Date },
    ): Promise<MembershipRow> {
      const [row] = await db
        .update(memberships)
        .set({ role: v.role, invitedBy: v.invitedBy, invitedAt: v.now })
        .where(and(eq(memberships.id, id), isNull(memberships.acceptedAt)))
        .returning();
      return row;
    },

    /** Sets `accepted_at` once; a second call keeps the first acceptance time. */
    async accept(id: string, now: Date): Promise<void> {
      await db
        .update(memberships)
        .set({ acceptedAt: now })
        .where(and(eq(memberships.id, id), isNull(memberships.acceptedAt)));
    },

    async softDelete(id: string, now: Date): Promise<void> {
      await db
        .update(memberships)
        .set({ deletedAt: now })
        .where(and(eq(memberships.id, id), isNull(memberships.deletedAt)));
    },
  };
}

export type MembershipsRepo = ReturnType<typeof createMembershipsRepo>;
