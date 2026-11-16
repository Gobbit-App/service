import { and, eq, gt, sql } from 'drizzle-orm';
import { profileEvents, usernameHolds, type DbExecutor } from '@gobbit/db';

/** 046: audit rows and username holds; both run on the caller's transaction. */
export function createProfileRepo(db: DbExecutor) {
  return {
    /** The unexpired hold on a lower-cased username, if any. */
    async activeHold(
      usernameLower: string,
      now: Date,
    ): Promise<{ releasedBy: string; holdUntil: Date } | null> {
      const [row] = await db
        .select({ releasedBy: usernameHolds.releasedBy, holdUntil: usernameHolds.holdUntil })
        .from(usernameHolds)
        .where(
          and(eq(usernameHolds.usernameLower, usernameLower), gt(usernameHolds.holdUntil, now)),
        )
        .limit(1);
      return row ?? null;
    },

    /**
     * D424: the two members can both see a live deck. A member sees a deck they own (owner
     * account) or hold an accepted membership on.
     */
    async sharesDeckWith(callerId: string, targetId: string): Promise<boolean> {
      const sees = (id: string) => sql`(
        d.owner_account_id = (select account_id from users where id = ${id})
        or exists (select 1 from memberships m where m.deck_id = d.id and m.user_id = ${id}
          and m.accepted_at is not null and m.deleted_at is null))`;
      const res = await db.execute(
        sql`select 1 from decks d where d.deleted_at is null and ${sees(callerId)} and ${sees(targetId)} limit 1`,
      );
      return res.rows.length > 0;
    },

    /** `changes` are field names only, never values. */
    async insertProfileEvent(input: {
      userId: string;
      changes: string[];
      requestId: string;
    }): Promise<void> {
      await db.insert(profileEvents).values(input);
    },

    /** A re-release extends the hold (the new release time and owner win). */
    async insertHold(input: {
      usernameLower: string;
      releasedBy: string;
      holdUntil: Date;
    }): Promise<void> {
      await db
        .insert(usernameHolds)
        .values(input)
        .onConflictDoUpdate({
          target: usernameHolds.usernameLower,
          set: { releasedBy: input.releasedBy, holdUntil: input.holdUntil },
        });
    },
  };
}

export type ProfileRepo = ReturnType<typeof createProfileRepo>;
