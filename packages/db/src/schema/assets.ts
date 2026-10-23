import { check, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { assetSources } from '@pb/shared';
import { tstz } from './common';
import { decks } from './decks';
import { users } from './users';

export const assetSourceEnum = pgEnum('asset_source', assetSources);

/**
 * D156: every image Gobbit stored in Cloudinary. Inserted on upload, deleted by the orphan
 * sweep (D158) or with its deck; never edited except to fill null dimensions on confirm.
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    publicId: text().notNull().unique('assets_public_id_key'),
    source: assetSourceEnum().notNull(),
    width: integer(),
    height: integer(),
    bytes: integer(),
    format: text(),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('assets_created_at_idx').on(t.createdAt),
    index('assets_deck_id_idx').on(t.deckId),
    check('assets_width_chk', sql`${t.width} IS NULL OR ${t.width} > 0`),
    check('assets_height_chk', sql`${t.height} IS NULL OR ${t.height} > 0`),
    check('assets_bytes_chk', sql`${t.bytes} IS NULL OR ${t.bytes} >= 0`),
  ],
);
