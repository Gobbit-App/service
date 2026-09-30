import { and, asc, eq, isNull } from 'drizzle-orm';
import { accounts, users } from '@pb/db';
import type { Db } from '@pb/db';
import type { CurrentUser } from '../types';

const currentUserColumns = {
  id: users.id,
  accountId: users.accountId,
  email: users.email,
  displayName: users.displayName,
};

export function createUsersRepo(db: Db) {
  return {
    /** `email` must already be normalised (trimmed, lowercased) — emails are stored that way. */
    async findByEmail(email: string): Promise<CurrentUser | null> {
      const [row] = await db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<CurrentUser | null> {
      const [row] = await db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /** Live users of an account — a deck's implicit owners (D33). */
    async listByAccount(accountId: string): Promise<CurrentUser[]> {
      return db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.accountId, accountId), isNull(users.deletedAt)))
        .orderBy(asc(users.createdAt), asc(users.id));
    },

    /** D25: account and user in one transaction; the account is named after the user. */
    async createWithAccount(v: { email: string; displayName: string }): Promise<CurrentUser> {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ name: v.displayName })
          .returning({ id: accounts.id });
        const [user] = await tx
          .insert(users)
          .values({ accountId: account.id, email: v.email, displayName: v.displayName })
          .returning(currentUserColumns);
        return user;
      });
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
