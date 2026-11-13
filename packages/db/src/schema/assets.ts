import { check, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { assetSources, MEDIA_FILE_NAME_MAX } from '@gobbit/shared';
import { assetResourceTypeEnum, mediaKindEnum, tstz } from './common';
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
    /** D388 (045): how the provider stores the file; deletes and URLs use it. */
    resourceType: assetResourceTypeEnum().notNull().default('image'),
    /** D390: derived from `format` by the server, never taken from a client. */
    kind: mediaKindEnum().notNull().default('image'),
    durationMs: integer(),
    pages: integer(),
    /** D396: the provider's content fingerprint (MD5); null for pre-045 rows. */
    etag: text(),
    originalFilename: text(),
    /** D390: when the sweep's verify pass checked the facts against the provider. */
    verifiedAt: tstz(),
    /** D390: the verify pass found a false or over-limit fact and deleted the file. */
    rejectedAt: tstz(),
  },
  (t) => [
    index('assets_created_at_idx').on(t.createdAt),
    index('assets_deck_id_idx').on(t.deckId),
    // D396: media dedup looks up a deck's files by fingerprint.
    index('assets_deck_etag_idx')
      .on(t.deckId, t.etag)
      .where(sql`${t.etag} IS NOT NULL`),
    check('assets_width_chk', sql`${t.width} IS NULL OR ${t.width} > 0`),
    check('assets_height_chk', sql`${t.height} IS NULL OR ${t.height} > 0`),
    check('assets_bytes_chk', sql`${t.bytes} IS NULL OR ${t.bytes} >= 0`),
    check('assets_duration_chk', sql`${t.durationMs} IS NULL OR ${t.durationMs} > 0`),
    check('assets_pages_chk', sql`${t.pages} IS NULL OR ${t.pages} > 0`),
    check(
      'assets_original_filename_chk',
      sql`${t.originalFilename} IS NULL OR char_length(${t.originalFilename}) <= ${sql.raw(String(MEDIA_FILE_NAME_MAX))}`,
    ),
    // D388: PDFs are image resources, audio is a video resource.
    check(
      'assets_kind_resource_check',
      sql`(${t.kind} IN ('image', 'pdf') AND ${t.resourceType} = 'image') OR (${t.kind} IN ('audio', 'video') AND ${t.resourceType} = 'video')`,
    ),
  ],
);
