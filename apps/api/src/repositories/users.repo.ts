import { and, isNull, sql } from 'drizzle-orm';
import { users } from '@pb/db';
import type { Db } from '@pb/db';
import type { CurrentUser } from '../types';

export function createUsersRepo(db: Db) {
  return {
    async findByEmail(email: string): Promise<CurrentUser | null> {
      const [row] = await db
        .select({
          id: users.id,
          accountId: users.accountId,
          email: users.email,
        })
        .from(users)
        .where(and(sql`lower(${users.email}) = lower(${email})`, isNull(users.deletedAt)))
        .limit(1);

      return row ?? null;
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
