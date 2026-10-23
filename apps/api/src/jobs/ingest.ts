import {
  EXTRACT_STYLE_EXAMPLES,
  type DedupVerdict,
  INGEST_JOB_RETRIES,
  type IngestRaw,
  type MemberRole,
  type NormalizedSource,
} from '@pb/shared';
import { lockedHostOf } from '@pb/shared/links';
import type { AssetsRepo } from '../repositories/assets.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { runExtraction, type RunExtractionDeps } from '../ingest/run-extraction';
import type { RunDedupInput } from '../ingest/run-dedup';
import { proposeItem } from '../ingest/propose';
import type { EmbedQueue } from './embed-queue';
import type { LinkSnapshotQueue } from './link-snapshot-queue';
import { toLinkPreview } from '../fetch/link-preview';
import { lineSink } from '../lib/logger';

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
  /** D167: dimensions of the shared image for a locked-host preview; omitted → none. */
  assets?: Pick<AssetsRepo, 'byPublicId'>;
  now?: () => Date;
  log?: (message: string) => void;
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
  const log = deps.log ?? lineSink('ingest');

  async function fail(jobId: string, error: string): Promise<IngestOutcome> {
    await jobs.setStatus(jobId, 'failed', error.slice(0, 500), now());
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
      const linkPreview = source.og
        ? toLinkPreview({ title: source.pageTitle ?? null, og: source.og })
        : null;
      const lockedHost = sourceUrl ? lockedHostOf(sourceUrl) : null;
      const imagePublicId = job.raw.images[0]?.publicId;
      const imageDimensions =
        lockedHost && imagePublicId ? await assetDimensions(imagePublicId) : null;
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
      if (!outcome.ok) return await fail(job.id, outcome.error);

      await proposeItem(
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
          job: { id: job.id, deckId: job.deckId, userId: job.userId, channel: job.channel },
          item: outcome.item,
          summary: outcome.summary,
          signal: opts?.signal,
        },
      );
      return 'proposed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLastAttempt(job.attempts)) return fail(job.id, `error: ${message}`);
      log(`[ingest] job ${job.id} attempt ${job.attempts} failed, will retry: ${message}`);
      throw err;
    }
  };
}
