import {
  EXTRACT_STYLE_EXAMPLES,
  type DedupVerdict,
  INGEST_JOB_RETRIES,
  type IngestChannel,
  type IngestRaw,
  type MemberRole,
  type NormalizedSource,
  type SourceKind,
} from '@pb/shared';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { runExtraction, type RunExtractionDeps } from '../ingest/run-extraction';
import type { RunDedupInput } from '../ingest/run-dedup';
import type { EmbedQueue } from './embed-queue';

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
  now?: () => Date;
  log?: (message: string) => void;
}

/** D100: email shares are tagged `email`; everything else came through a share. */
export function sourceKindFor(channel: IngestChannel): SourceKind {
  return channel === 'email' ? 'email' : 'share';
}

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
  const log = deps.log ?? ((m: string) => console.error(m));

  /** The proposal already exists, so a dedup error leaves no verdict rather than retrying. */
  async function verdictFor(input: RunDedupInput): Promise<DedupVerdict | null> {
    if (!deps.dedup) return null;
    try {
      return await deps.dedup(input);
    } catch (err) {
      log(
        `[ingest] dedup for job ${input.jobId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async function fail(jobId: string, error: string): Promise<IngestOutcome> {
    await jobs.setStatus(jobId, 'failed', error.slice(0, 500), now());
    return 'failed';
  }

  return async function ingest(
    jobId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<IngestOutcome> {
    const job = await jobs.claim(jobId);
    if (!job) return 'skipped';
    if (!job.raw) return fail(job.id, 'raw_missing');
    if (!job.userId) return fail(job.id, 'sharer_gone');

    try {
      const role = await deps.roleOf(job.deckId, job.userId);
      if (!role) return await fail(job.id, 'sharer_not_member');

      const source = job.normalized ?? (await deps.normalize(job.raw));
      if (!job.normalized) await jobs.update(job.id, { normalized: source });

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
      const outcome = await runExtraction(deps.extraction, {
        source,
        categories: deckCategories.map((c) => ({ id: c.id, name: c.name })),
        examples: recent.map((i) => ({ type: i.type, title: i.title, body: i.body })),
        validate: {
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(job.raw.images[0] ? { imagePublicId: job.raw.images[0].publicId } : {}),
          categoryIds: deckCategories.map((c) => c.id),
        },
        jobId: job.id,
        deckId: job.deckId,
        userId: job.userId,
        signal: opts?.signal,
      });
      if (!outcome.ok) return await fail(job.id, outcome.error);

      // A proposal needs a visible home; the default category stands in when none fit.
      let categoryIds = outcome.summary.categoryIds;
      if (categoryIds.length === 0) {
        const fallback = await categories.findDefault(job.deckId);
        categoryIds = fallback ? [fallback.id] : [];
      }

      const { item } = outcome;
      const created = await items.create(
        {
          deckId: job.deckId,
          type: item.type,
          status: 'proposed',
          title: item.title,
          body: item.body,
          payload: item.payload,
          entities: item.entities ?? {},
          sourceUrl: item.sourceUrl ?? null,
          sourceKind: sourceKindFor(job.channel),
          verifiedAt: null,
          createdBy: job.userId,
        },
        categoryIds,
      );

      const dedup = await verdictFor({
        itemId: created.id,
        deckId: job.deckId,
        title: created.title,
        sourceUrl: created.sourceUrl,
        jobId: job.id,
        userId: job.userId,
        signal: opts?.signal,
      });

      await jobs.update(job.id, {
        status: 'proposed',
        extraction: { ...outcome.summary, categoryIds },
        resultItemId: created.id,
        dedup,
        error: null,
        finishedAt: now(),
      });
      await embedQueue.enqueueIfStale(created.id);
      return 'proposed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLastAttempt(job.attempts)) return fail(job.id, `error: ${message}`);
      log(`[ingest] job ${job.id} attempt ${job.attempts} failed, will retry: ${message}`);
      throw err;
    }
  };
}
