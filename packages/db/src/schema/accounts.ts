import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './common';

export const accounts = pgTable('accounts', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  ...timestamps,
});
