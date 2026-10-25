import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import {
  ingestJobs,
  llmCalls,
  type DbExecutor,
  type IngestJobRow,
  type NewIngestJobRow,
} from '@pb/db';
import {
  SHARE_MAX_RETRIES,
  type IngestChannel,
  type IngestFailureCode,
  type IngestJobStatus,
} from '@pb/shared';

/** Fields the worker writes as the job moves through the pipeline (D93). */
export type IngestJobPatch = Partial<
  Pick<
    IngestJobRow,
    | 'status'
    | 'normalized'
    | 'extraction'
    | 'dedup'
    | 'resultItemId'
    | 'error'
    | 'finishedAt'
    | 'reviewedBy'
    | 'reviewedAt'
    | 'raw'
    | 'autoPublish'
  >
>;

export function createIngestJobsRepo(db: DbExecutor) {
  return {
    async create(v: NewIngestJobRow): Promise<IngestJobRow> {
      const [row] = await db.insert(ingestJobs).values(v).returning();
      return row;
    },

    async findById(id: string): Promise<IngestJobRow | null> {
      const [row] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, id)).limit(1);
      return row ?? null;
    },

    async findByResultItem(itemId: string): Promise<IngestJobRow | null> {
      const [row] = await db
        .select()
        .from(ingestJobs)
        .where(eq(ingestJobs.resultItemId, itemId))
        .limit(1);
      return row ?? null;
    },

    async findByResultItems(itemIds: string[]): Promise<IngestJobRow[]> {
      if (itemIds.length === 0) return [];
      return await db.select().from(ingestJobs).where(inArray(ingestJobs.resultItemId, itemIds));
    },

    /** D196: the sharer's jobs on a deck since `since`, newest first. */
    async listForSharer(p: {
      userId: string;
      deckId: string;
      since: Date;
      channels: readonly IngestChannel[];
      limit: number;
    }): Promise<IngestJobRow[]> {
      return await db
        .select()
        .from(ingestJobs)
        .where(
          and(
            eq(ingestJobs.userId, p.userId),
            eq(ingestJobs.deckId, p.deckId),
            gte(ingestJobs.createdAt, p.since),
            inArray(ingestJobs.channel, [...p.channels]),
          ),
        )
        .orderBy(desc(ingestJobs.createdAt), desc(ingestJobs.id))
        .limit(p.limit);
    },

    /**
     * D197: puts a failed job back in the queue, only while it still has its share and retries
     * left (conditional, so two taps can't both win). Null when the job no longer qualifies.
     */
    async resetForRetry(id: string, now: Date): Promise<IngestJobRow | null> {
      const [row] = await db
        .update(ingestJobs)
        .set({
          status: 'queued',
          attempts: 0,
          error: null,
          failureCode: null,
          autoPublish: null,
          finishedAt: null,
          retryCount: sql`${ingestJobs.retryCount} + 1`,
          retriedAt: now,
        })
        .where(
          and(
            eq(ingestJobs.id, id),
            eq(ingestJobs.status, 'failed'),
            isNotNull(ingestJobs.raw),
            lt(ingestJobs.retryCount, SHARE_MAX_RETRIES),
          ),
        )
        .returning();
      return row ?? null;
    },

    /**
     * D110: jobs a user created (or retried, D197) since `since`, of one channel or of every
     * channel but `exclude`.
     */
    async countByUserSince(
      userId: string,
      since: Date,
      channel?: IngestChannel,
      exclude: readonly IngestChannel[] = [],
    ): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(ingestJobs)
        .where(
          and(
            eq(ingestJobs.userId, userId),
            or(gte(ingestJobs.createdAt, since), gte(ingestJobs.retriedAt, since)),
            channel ? eq(ingestJobs.channel, channel) : undefined,
            exclude.length > 0 ? notInArray(ingestJobs.channel, [...exclude]) : undefined,
          ),
        );
      return row?.n ?? 0;
    },

    async update(id: string, patch: IngestJobPatch): Promise<void> {
      await db.update(ingestJobs).set(patch).where(eq(ingestJobs.id, id));
    },

    /**
     * Moves a queued (or stale running) job to `running` and bumps `attempts`; null when the
     * job is gone or already past the pipeline (another worker finished it).
     */
    async claim(id: string): Promise<IngestJobRow | null> {
      const [row] = await db
        .update(ingestJobs)
        .set({ status: 'running', attempts: sql`${ingestJobs.attempts} + 1` })
        .where(and(eq(ingestJobs.id, id), inArray(ingestJobs.status, ['queued', 'running'])))
        .returning();
      return row ?? null;
    },

    /** D93 sweep: queued or running jobs untouched since `before`. */
    async listStale(before: Date, limit = 100): Promise<Pick<IngestJobRow, 'id' | 'attempts'>[]> {
      return await db
        .select({ id: ingestJobs.id, attempts: ingestJobs.attempts })
        .from(ingestJobs)
        .where(
          and(inArray(ingestJobs.status, ['queued', 'running']), lt(ingestJobs.updatedAt, before)),
        )
        .limit(limit);
    },

    /** A failed job always carries a failure code (D194); `unknown` when the caller has none. */
    async setStatus(
      id: string,
      status: IngestJobStatus,
      error: string | null,
      now: Date,
      failureCode?: IngestFailureCode,
    ) {
      await db
        .update(ingestJobs)
        .set({
          status,
          error,
          finishedAt: now,
          failureCode: status === 'failed' ? (failureCode ?? 'unknown') : null,
        })
        .where(eq(ingestJobs.id, id));
    },

    /** Σ llm_calls.cost_usd for the job (D110). */
    async costUsd(id: string): Promise<number> {
      const [row] = await db
        .select({ total: sql<string | null>`sum(${llmCalls.costUsd})` })
        .from(llmCalls)
        .where(eq(llmCalls.jobId, id));
      return Number(row?.total ?? 0);
    },

    /**
     * D94 retention: drops `raw`/`normalized` of jobs older than `before`, and returns the
     * failed/discarded jobs among them that still hold uploads (their images get deleted).
     */
    async pruneBefore(before: Date): Promise<{ pruned: number; withUploads: string[] }> {
      const old = and(lt(ingestJobs.createdAt, before), isNotNull(ingestJobs.raw));
      const withUploads = await db
        .select({ id: ingestJobs.id })
        .from(ingestJobs)
        .where(
          and(
            old,
            or(eq(ingestJobs.status, 'failed'), eq(ingestJobs.status, 'discarded')),
            sql`jsonb_array_length(${ingestJobs.raw} -> 'images') > 0`,
          ),
        );
      const rows = await db
        .update(ingestJobs)
        .set({ raw: null, normalized: null })
        .where(old)
        .returning({ id: ingestJobs.id });
      return { pruned: rows.length, withUploads: withUploads.map((r) => r.id) };
    },
  };
}

export type IngestJobsRepo = ReturnType<typeof createIngestJobsRepo>;
