import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  SHARE_MAX_RETRIES,
  autoPublishOutcomes,
  ingestFailureCodes,
  type AutoPublishOutcome,
  type IngestFailureCode,
  INGEST_CLIENT_LABEL_MAX,
  ingestChannels,
  ingestJobStatuses,
  type DedupVerdict,
  type ExtractionSummary,
  type IngestRaw,
  type NormalizedSource,
} from '@gobbit/shared';
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
    /** The AI app behind a direct (`mcp`) proposal, shown on the review source line. */
    clientLabel: varchar({ length: INGEST_CLIENT_LABEL_MAX }),
    status: ingestJobStatusEnum().notNull().default('queued'),
    /** What was shared; nulled after 30 days by prune-ingest-jobs. */
    raw: jsonb().$type<IngestRaw>(),
    /** D102 normalized source; nulled after 30 days. */
    normalized: jsonb().$type<NormalizedSource>(),
    extraction: jsonb().$type<ExtractionSummary>(),
    dedup: jsonb().$type<DedupVerdict>(),
    resultItemId: uuid().references(() => items.id, { onDelete: 'set null' }),
    error: text(),
    /** D194: the reason the sharer sees; only on failed jobs. */
    failureCode: text().$type<IngestFailureCode>(),
    /** D193: the auto-publish gate's outcome; null when the gate did not run. */
    autoPublish: text().$type<AutoPublishOutcome>(),
    attempts: integer().notNull().default(0),
    /** D197: retries the sharer asked for. */
    retryCount: smallint().notNull().default(0),
    retriedAt: tstz(),
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
    index('ingest_jobs_sharer_deck_idx').on(t.userId, t.deckId, t.createdAt.desc()),
    check(
      'ingest_jobs_failure_code_chk',
      sql`${t.failureCode} IS NULL OR ${t.failureCode} IN (${sqlList(ingestFailureCodes)})`,
    ),
    check(
      'ingest_jobs_failure_code_status_chk',
      sql`${t.failureCode} IS NULL OR ${t.status} = 'failed'`,
    ),
    check(
      'ingest_jobs_auto_publish_chk',
      sql`${t.autoPublish} IS NULL OR ${t.autoPublish} IN (${sqlList(autoPublishOutcomes)})`,
    ),
    check(
      'ingest_jobs_retry_count_chk',
      sql`${t.retryCount} BETWEEN 0 AND ${sql.raw(String(SHARE_MAX_RETRIES))}`,
    ),
  ],
);

/** `'a', 'b'` for an IN list of fixed constants (never user input). */
function sqlList(values: readonly string[]) {
  return sql.raw(values.map((v) => `'${v}'`).join(', '));
}
