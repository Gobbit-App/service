import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  ingestChannels,
  ingestJobStatuses,
  type DedupVerdict,
  type ExtractionSummary,
  type IngestRaw,
  type NormalizedSource,
} from '@pb/shared';
import { tstz } from './common';
import { decks } from './decks';
import { items } from './items';
import { users } from './users';

export const ingestJobStatusEnum = pgEnum('ingest_job_status', ingestJobStatuses);
export const ingestChannelEnum = pgEnum('ingest_channel', ingestChannels);

/** D93/D94: one row per share; the worker moves it through the pipeline stages. */
export const ingestJobs = pgTable(
  'ingest_jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    channel: ingestChannelEnum().notNull(),
    status: ingestJobStatusEnum().notNull().default('queued'),
    /** What was shared; nulled after 30 days by prune-ingest-jobs. */
    raw: jsonb().$type<IngestRaw>(),
    /** D102 normalized source; nulled after 30 days. */
    normalized: jsonb().$type<NormalizedSource>(),
    extraction: jsonb().$type<ExtractionSummary>(),
    dedup: jsonb().$type<DedupVerdict>(),
    resultItemId: uuid().references(() => items.id, { onDelete: 'set null' }),
    error: text(),
    attempts: integer().notNull().default(0),
    /** D109: the reviewer and when they acted (publish or discard). */
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: tstz(),
    finishedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('ingest_jobs_user_idx').on(t.userId, t.createdAt.desc()),
    index('ingest_jobs_deck_status_idx').on(t.deckId, t.status),
    index('ingest_jobs_result_item_idx').on(t.resultItemId),
  ],
);
