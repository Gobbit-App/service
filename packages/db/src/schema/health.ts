import { pgTable, smallint, text } from 'drizzle-orm/pg-core';
import { tstz } from './common';

export const health = pgTable('health', {
  id: smallint().primaryKey(),
  status: text().notNull(),
  createdAt: tstz().notNull().defaultNow(),
});
