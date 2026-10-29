import {
  EXTRACT_STYLE_EXAMPLES,
  type AutoPublishOutcome,
  type DedupVerdict,
  INGEST_JOB_RETRIES,
  type IngestFailureCode,
  type IngestRaw,
  type MemberRole,
  type NormalizedSource,
} from '@gobbit/shared';
import type { IngestJobRow } from '@gobbit/db';
import { lockedHostOf } from '@gobbit/shared/links';
import type { AssetsRepo } from '../repositories/assets.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { runExtraction, type RunExtractionDeps } from '../ingest/run-extraction';
import type { RunDedupInput } from '../ingest/run-dedup';
import { proposeItem } from '../ingest/propose';
import type { AutoPublishInput } from '../ingest/auto-publish';
import type { EmbedQueue } from './embed-queue';
import type { LinkSnapshotQueue } from './link-snapshot-queue';
import { toLinkPreview } from '../fetch/link-preview';
import { classifyFailure, failureDetail, type IngestStage } from '../ingest/failure-code';
import { childLogger, lineSink, type Logger } from '../lib/logger';

export type IngestOutcome = 'proposed' | 'failed' | 'skipped';

export interface IngestHandlerDeps {
  jobs: Pick<IngestJobsRepo, 'claim' | 'update' | 'setStatus'>;
  categories: Pick<CategoriesRepo, 'listByDeck' | 'findDefault'>;
  items: Pick<ItemsRepo, 'list' | 'create'>;
  /** D33: the sharer's current role on the deck (null → no longer a member). */
  roleOf: (deckId: string, userId: string) => Promise<MemberRole | null>;
  normalize: (raw: IngestRaw) => Promise<NormalizedSource>;
  extraction: RunExtractionDeps;
  /** D103: the dedup verdict for the new proposal (bound `runDedup`); omitted → no verdict. */
  dedup?: (input: RunDedupInput) => Promise<DedupVerdict>;
  embedQueue: EmbedQueue;
  /** D163: snapshot a proposed link's preview image; omitted → none. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  /** D193: bound `autoPublish`, run after the proposal exists; omitted → always review. Never throws. */
  autoPublish?: (input: AutoPublishInput) => Promise<AutoPublishOutcome | null>;
  /** D167: dimensions of the shared image for a locked-host preview; omitted → none. */
  assets?: Pick<AssetsRepo, 'byPublicId'>;
  now?: () => Date;
  /** Line sink handed to `proposeItem`. */
  log?: (message: string) => void;
  /** D195: structured, content-free failure lines; default `childLogger('ingest')`. */
  logger?: Pick<Logger, 'error' | 'warn'>;
}

type FailingJob = Pick<IngestJobRow, 'id' | 'deckId' | 'channel' | 'attempts'>;

/** pg-boss runs a job at most 1 + INGEST_JOB_RETRIES times; the last failure is final. */
export function isLastAttempt(attempts: number): boolean {
  return attempts > INGEST_JOB_RETRIES;
}

/**
 * D93: one ingest job through the pipeline: claim → normalize (D102) → extract (D105/D110) →
 * insert a `proposed` card by the sharer (D109) → embed the draft and dedup (D103) → enqueue its
 * embedding (a no-op once the draft vector is stored). Invalid model output
 * fails the job; provider errors rethrow so pg-boss retries, until the last attempt fails it.
 */
export function createIngestHandler(deps: IngestHandlerDeps) {
  const { jobs, categories, items, embedQueue } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? lineSink('ingest');
  const logger = deps.logger ?? childLogger('ingest');

  /**
   * D194/D195: stores the error and the code the sharer sees; logs one line without the error
   * text, which may quote the shared URL or content (only an invalid answer's detail is logged).
   */
  async function fail(
    job: FailingJob,
    error: string,
    failureCode: IngestFailureCode = classifyFailure(error),
  ): Promise<IngestOutcome> {
    await jobs.setStatus(job.id, 'failed', error.slice(0, 500), now(), failureCode);
    const detail = failureDetail(error);
    logger.error(
      {
        jobId: job.id,
        deckId: job.deckId,
        channel: job.channel,
        attempts: job.attempts,
        failureCode,
        ...(detail ? { detail } : {}),
      },
      'ingest job failed',
    );
    return 'failed';
  }

  async function assetDimensions(publicId: string) {
    const asset = await deps.assets?.byPublicId(publicId);
    return asset?.width && asset.height ? { width: asset.width, height: asset.height } : null;
  }

  return async function ingest(
    jobId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<IngestOutcome> {
    const job = await jobs.claim(jobId);
    if (!job) return 'skipped';
    if (!job.raw) return fail(job, 'raw_missing');
    if (!job.userId) return fail(job, 'sharer_gone');

    /** Where a thrown error came from, for the sharer's reason (D194). */
    let stage: IngestStage | undefined;
    try {
      const role = await deps.roleOf(job.deckId, job.userId);
      if (!role) return await fail(job, 'sharer_not_member');

      stage = 'normalize';
      const source = job.normalized ?? (await deps.normalize(job.raw));
      if (!job.normalized) await jobs.update(job.id, { normalized: source });
      stage = undefined;

      const [deckCategories, recent] = await Promise.all([
        categories.listByDeck(job.deckId, role),
        items.list({
          role,
          deckId: job.deckId,
          status: 'published',
          limit: EXTRACT_STYLE_EXAMPLES,
        }),
      ]);

      const sourceUrl = job.raw.url ?? source.url;
      const linkPreview = source.og
        ? toLinkPreview({ title: source.pageTitle ?? null, og: source.og })
        : null;
      const lockedHost = sourceUrl ? lockedHostOf(sourceUrl) : null;
      const imagePublicId = job.raw.images[0]?.publicId;
      const imageDimensions =
        lockedHost && imagePublicId ? await assetDimensions(imagePublicId) : null;
      stage = 'extract';
      const outcome = await runExtraction(deps.extraction, {
        source,
        categories: deckCategories.map((c) => ({ id: c.id, name: c.name })),
        examples: recent.map((i) => ({ type: i.type, title: i.title, body: i.body })),
        validate: {
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(linkPreview ? { linkPreview } : {}),
          ...(imagePublicId ? { imagePublicId } : {}),
          ...(lockedHost ? { lockedHost, imageDimensions } : {}),
          ...(job.raw.text ? { sharedText: job.raw.text } : {}),
          categoryIds: deckCategories.map((c) => c.id),
        },
        jobId: job.id,
        deckId: job.deckId,
        userId: job.userId,
        signal: opts?.signal,
      });
      stage = undefined;
      if (!outcome.ok) return await fail(job, outcome.error);

      const jobRef = { id: job.id, deckId: job.deckId, userId: job.userId, channel: job.channel };
      const proposed = await proposeItem(
        {
          categories,
          items,
          jobs,
          dedup: deps.dedup,
          embedQueue,
          linkSnapshotQueue: deps.linkSnapshotQueue,
          now,
          log,
        },
        {
          job: jobRef,
          item: outcome.item,
          summary: outcome.summary,
          signal: opts?.signal,
        },
      );
      // D193: the proposal exists; publishing it directly is best effort, review is the fallback.
      await deps.autoPublish?.({
        job: jobRef,
        proposal: proposed.item,
        categoryIds: outcome.summary.categoryIds,
        verdict: proposed.dedup,
      });
      return 'proposed';
    } catch (err) {
      const failureCode = classifyFailure(err, stage);
      if (isLastAttempt(job.attempts)) {
        const message = err instanceof Error ? err.message : String(err);
        return fail(job, `error: ${message}`, failureCode);
      }
      logger.warn(
        { jobId: job.id, attempts: job.attempts, failureCode },
        'ingest attempt failed, will retry',
      );
      throw err;
    }
  };
}
