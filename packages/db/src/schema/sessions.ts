import { pgTable, uuid, text, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sessionKindEnum, tstz } from './common';
import { users } from './users';

/** D27: opaque server-side sessions; only the sha256 of the token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    kind: sessionKindEnum().notNull(),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    userAgent: text(),
    revokedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
  ],
);
