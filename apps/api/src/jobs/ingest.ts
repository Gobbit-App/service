import {
  DIRECT_PROPOSAL_MODEL,
  EXTRACT_STYLE_EXAMPLES,
  type AutoPublishOutcome,
  type DedupVerdict,
  type ExtractionSummary,
  INGEST_JOB_RETRIES,
  type IngestFailureCode,
  type IngestRaw,
  type ItemCreateResolved,
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
import { buildMediaProposal } from '../ingest/media-proposal';
import type { AutoPublishInput } from '../ingest/auto-publish';
import type { EmbedQueue } from './embed-queue';
import type { LinkSnapshotQueue } from './link-snapshot-queue';
import { toLinkPreview } from '../fetch/link-preview';
import type { NormalizeContext } from '../ingest/normalize-raw';
import { appliedPreview, logPreviewApplied } from '../ingest/applied-preview';
import type { ValidateContext } from '../ai/extract-validate';
import type { EventContext } from '../ai/extract-event';
import { logEventExtract, resolveEventZone } from '../ingest/event-extract';
import { classifyFailure, failureDetail, type IngestStage } from '../ingest/failure-code';
import { logPreviewFallback, previewFallback } from '../ingest/preview-fallback';
import { childLogger, lineSink, type Logger } from '../lib/logger';
import { bestEffort, bestEffortContext } from '../ingest/best-effort';
import { logExtractionSkipped } from '../ingest/best-effort.events';
import { validateProposal } from '../ai/extract-validate';

/**
 * D346: a source normalized by the preview builder carries its preview (or none, when a locked
 * host's wall was discarded); one normalized before 041 still has only the page's OG tags.
 */
function previewOf(source: NormalizedSource) {
  if (source.imageCandidates !== undefined) return source.linkPreview ?? null;
  return source.og ? toLinkPreview({ title: source.pageTitle ?? null, og: source.og }) : null;
}

export type IngestOutcome = 'proposed' | 'failed' | 'skipped';

export interface IngestHandlerDeps {
  jobs: Pick<IngestJobsRepo, 'claim' | 'update' | 'setStatus'>;
  categories: Pick<CategoriesRepo, 'listByDeck' | 'findDefault'>;
  items: Pick<ItemsRepo, 'list' | 'create'>;
  /** D33: the sharer's current role on the deck (null → no longer a member). */
  roleOf: (deckId: string, userId: string) => Promise<MemberRole | null>;
  normalize: (raw: IngestRaw, ctx: NormalizeContext) => Promise<NormalizedSource>;
  extraction: RunExtractionDeps;
  /** D103: the dedup verdict for the new proposal (bound `runDedup`); omitted → no verdict. */
  dedup?: (input: RunDedupInput) => Promise<DedupVerdict>;
  embedQueue: EmbedQueue;
  /** D163: snapshot a proposed link's preview image; omitted → none. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  /** D193: bound `autoPublish`, run after the proposal exists; omitted → always review. Never throws. */
  autoPublish?: (input: AutoPublishInput) => Promise<AutoPublishOutcome | null>;
  /** D370/D374: event rules; omitted → shares are never proposed as events. */
  events?: IngestEventDeps;
  /** D167: dimensions of the shared image for a locked-host preview; omitted → none. */
  assets?: Pick<AssetsRepo, 'byPublicId'>;
  /**
   * D453: whether the sharer has smart share on (`users.smart_share`); off → the share is saved
   * as sent, no model call. Read per job, so a change applies to the next share.
   */
  smartShare: (userId: string) => Promise<boolean>;
  now?: () => Date;
  /** Line sink handed to `proposeItem`. */
  log?: (message: string) => void;
  /** D195: structured, content-free failure lines; default `childLogger('ingest')`. */
  logger?: Pick<Logger, 'error' | 'warn' | 'info'>;
}

/** What the handler needs to propose events (D370, D371, D374). */
export interface IngestEventDeps {
  /** `INGEST_DEFAULT_TIME_ZONE`: the zone of a share that carries none. */
  defaultTimeZone: string;
  startMaxDays: number;
  locationMax: number;
  /** Personal decks always notify `me` (D362). */
  isPersonalDeck: (deckId: string) => Promise<boolean>;
}

type FailingJob = Pick<IngestJobRow, 'id' | 'deckId' | 'channel' | 'attempts'>;
type JobRef = { id: string; deckId: string; userId: string; channel: IngestJobRow['channel'] };

/** What the extract stage worked from, kept for the preview fallback (D355). */
interface ExtractContext {
  source: NormalizedSource;
  validate: ValidateContext;
}

/** pg-boss runs a job at most 1 + INGEST_JOB_RETRIES times; the last failure is final. */
export function isLastAttempt(attempts: number): boolean {
  return attempts > INGEST_JOB_RETRIES;
}

/**
 * D93: one ingest job through the pipeline: claim → normalize (D102) → extract (D105/D110) →
 * insert a `proposed` card by the sharer (D109) → embed the draft and dedup (D103) → enqueue its
 * embedding (a no-op once the draft vector is stored). Invalid model output fails the job;
 * provider errors rethrow so pg-boss retries, until the last attempt fails it. D355: either
 * failure with page preview details proposes a card from the preview instead, for review only.
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

  async function propose(
    jobRef: JobRef,
    ctx: { source?: Pick<NormalizedSource, 'imageCandidates'>; validate: ValidateContext },
    item: ItemCreateResolved,
    summary: ExtractionSummary,
    signal: AbortSignal | undefined,
  ) {
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
        item,
        summary,
        ...(ctx.source?.imageCandidates ? { imageCandidates: ctx.source.imageCandidates } : {}),
        signal,
      },
    );
    const applied = appliedPreview(item, ctx.validate);
    if (applied) {
      logPreviewApplied(
        logger,
        applied,
        { jobId: jobRef.id, itemId: proposed.item.id, deckId: jobRef.deckId },
        ctx.validate,
      );
    }
    return proposed;
  }

  /**
   * D355: extraction failed; a card from the page preview goes to review (never auto-published),
   * so the share isn't lost. Null when the preview has nothing to build it from.
   */
  async function proposeFromPreview(
    jobRef: JobRef,
    ctx: ExtractContext,
    reason: IngestFailureCode,
    detail: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<IngestOutcome | null> {
    const fallback = previewFallback(ctx.validate, ctx.source.lang ?? 'und');
    if (!fallback) return null;
    const summary = { model: deps.extraction.model, ...fallback.summary };
    const proposed = await propose(jobRef, ctx, fallback.item, summary, signal);
    logPreviewFallback(
      logger,
      { jobId: jobRef.id, deckId: jobRef.deckId, itemId: proposed.item.id },
      reason,
      detail,
    );
    return 'proposed';
  }

  async function eventContext(
    events: IngestEventDeps,
    deckId: string,
    raw: IngestRaw,
    source: NormalizedSource,
  ): Promise<EventContext> {
    return {
      ...(source.structuredEvent ? { structured: source.structuredEvent } : {}),
      severalEvents: (source.structuredEventCount ?? 0) > 1,
      ...resolveEventZone(raw, events.defaultTimeZone),
      personalDeck: await events.isPersonalDeck(deckId),
      startMaxDays: events.startMaxDays,
      locationMax: events.locationMax,
      now: now(),
    };
  }

  /**
   * D395: the share's file as a direct media proposal (`extraction.model = 'direct'`), its
   * title and caption from the share alone. Logs `ingest.media_proposal`.
   */
  async function proposeFile(
    jobRef: JobRef,
    raw: IngestRaw,
    signal: AbortSignal | undefined,
  ): Promise<IngestOutcome> {
    const built = buildMediaProposal(raw, jobRef.channel);
    if (!built) {
      return fail({ ...jobRef, attempts: 1 }, 'media_proposal_invalid');
    }
    const summary: ExtractionSummary = {
      model: DIRECT_PROPOSAL_MODEL,
      escalated: false,
      type: 'media',
      confidence: 1,
      language: 'und',
      categoryIds: [],
      newCategory: null,
    };
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
      { job: jobRef, item: built.item, summary, signal },
    );
    logger.info(
      {
        event: 'ingest.media_proposal',
        outcome: 'proposed',
        reason: built.body,
        titleSource: built.titleSource,
        jobId: jobRef.id,
        deckId: jobRef.deckId,
        itemId: proposed.item.id,
        kind: raw.file?.kind,
      },
      'ingest.media_proposal',
    );
    await deps.autoPublish?.({
      job: jobRef,
      proposal: proposed.item,
      categoryIds: summary.categoryIds,
      verdict: proposed.dedup,
    });
    return 'proposed';
  }

  async function assetDimensions(publicId: string) {
    const asset = await deps.assets?.byPublicId(publicId);
    return asset?.width && asset.height ? { width: asset.width, height: asset.height } : null;
  }

  /** The validate context both paths share: the address, its preview and the locked-host photo. */
  async function validateBase(raw: IngestRaw, source?: NormalizedSource): Promise<ValidateContext> {
    const sourceUrl = raw.url ?? source?.url;
    const linkPreview = source ? previewOf(source) : null;
    const lockedHost = sourceUrl ? lockedHostOf(sourceUrl) : null;
    const imagePublicId = raw.images[0]?.publicId;
    const morePublicIds = raw.images.slice(1).map((img) => img.publicId);
    const imageDimensions =
      lockedHost && imagePublicId ? await assetDimensions(imagePublicId) : null;
    return {
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(linkPreview ? { linkPreview } : {}),
      ...(imagePublicId ? { imagePublicId } : {}),
      ...(morePublicIds.length > 0 ? { morePublicIds } : {}),
      ...(lockedHost ? { lockedHost, imageDimensions } : {}),
      ...(raw.text ? { sharedText: raw.text } : {}),
      categoryIds: [],
    };
  }

  /**
   * D454/D455: smart share is off; the share becomes a card as sent, never auto-published.
   * Only a link needs the page (a fetch error keeps the normal retry). Nothing built fails with
   * `best_effort_empty`, coded `unknown` (retryable; a retry fails the same way).
   */
  async function proposeBestEffort(
    job: IngestJobRow,
    jobRef: JobRef,
    raw: IngestRaw,
    signal: AbortSignal | undefined,
    setStage: (stage: IngestStage | undefined) => void,
  ): Promise<IngestOutcome> {
    const fields = {
      jobId: job.id,
      deckId: job.deckId,
      userId: jobRef.userId,
      channel: job.channel,
    };
    let built = bestEffort(raw, job.channel);
    let source: NormalizedSource | undefined;
    if (built?.needsPreview) {
      setStage('normalize');
      source = job.normalized ?? (await deps.normalize(raw, { jobId: job.id, deckId: job.deckId }));
      if (!job.normalized) await jobs.update(job.id, { normalized: source });
      setStage(undefined);
      built = bestEffort(raw, job.channel, raw.url ?? source.url);
    }
    const base = await validateBase(raw, source);
    const validate = built ? bestEffortContext(built.kind, raw, base) : undefined;
    let input = built?.input;
    if (built?.needsPreview && input && base.linkPreview) {
      // The page title wins over the share's; the page description stands in for absent text.
      const { title, description } = base.linkPreview;
      input = { ...input, title: title || input.title, body: input.body || description || '' };
    }
    const validated = input && validate ? validateProposal(input, validate) : null;
    if (!built || !validate || !validated?.ok) {
      logExtractionSkipped(logger as Logger, {
        ...fields,
        outcome: 'failed',
        kind: built?.kind ?? null,
        cut: built?.cut ?? false,
        unusedPhotos: built?.unusedPhotos ?? 0,
      });
      return fail(job, 'best_effort_empty', 'unknown');
    }
    const summary: ExtractionSummary = {
      model: DIRECT_PROPOSAL_MODEL,
      escalated: false,
      fallback: 'no_smart_share',
      ...(built.cut ? { bodyCut: true } : {}),
      ...validated.summary,
    };
    const proposed = await propose(
      jobRef,
      { ...(source ? { source } : {}), validate },
      validated.item,
      summary,
      signal,
    );
    logExtractionSkipped(logger as Logger, {
      ...fields,
      outcome: 'proposed',
      kind: built.kind,
      itemId: proposed.item.id,
      cut: built.cut,
      unusedPhotos: built.unusedPhotos,
    });
    return 'proposed';
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
    let extractCtx: ExtractContext | undefined;
    const jobRef: JobRef = {
      id: job.id,
      deckId: job.deckId,
      userId: job.userId,
      channel: job.channel,
    };
    try {
      const role = await deps.roleOf(job.deckId, job.userId);
      if (!role) return await fail(job, 'sharer_not_member');

      // D395: a PDF, audio or video share is proposed as is: no fetch, no model call.
      if (job.raw.file) return await proposeFile(jobRef, job.raw, opts?.signal);

      if (!(await deps.smartShare(job.userId))) {
        return await proposeBestEffort(job, jobRef, job.raw, opts?.signal, (s) => (stage = s));
      }

      stage = 'normalize';
      const source =
        job.normalized ?? (await deps.normalize(job.raw, { jobId: job.id, deckId: job.deckId }));
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

      const validate: ValidateContext = {
        ...(await validateBase(job.raw, source)),
        categoryIds: deckCategories.map((c) => c.id),
        ...(deps.events
          ? { event: await eventContext(deps.events, job.deckId, job.raw, source) }
          : {}),
      };
      extractCtx = { source, validate };
      stage = 'extract';
      const outcome = await runExtraction(deps.extraction, {
        source,
        categories: deckCategories.map((c) => ({ id: c.id, name: c.name })),
        examples: recent.map((i) => ({ type: i.type, title: i.title, body: i.body })),
        validate,
        jobId: job.id,
        deckId: job.deckId,
        userId: job.userId,
        signal: opts?.signal,
      });
      stage = undefined;
      if (!outcome.ok) {
        const fallback = await proposeFromPreview(
          jobRef,
          extractCtx,
          classifyFailure(outcome.error),
          failureDetail(outcome.error),
          opts?.signal,
        );
        return fallback ?? (await fail(job, outcome.error));
      }

      const proposed = await propose(
        jobRef,
        extractCtx,
        outcome.item,
        outcome.summary,
        opts?.signal,
      );
      if (outcome.eventDecision) {
        logEventExtract(
          logger,
          { jobId: job.id, deckId: job.deckId, userId: job.userId, itemId: proposed.item.id },
          outcome.eventDecision,
        );
      }
      // D193: the proposal exists; publishing it directly is best effort, review is the fallback.
      await deps.autoPublish?.({
        job: jobRef,
        proposal: proposed.item,
        categoryIds: outcome.summary.categoryIds,
        verdict: proposed.dedup,
        ...(outcome.summary.event ? { event: outcome.summary.event } : {}),
      });
      return 'proposed';
    } catch (err) {
      const failureCode = classifyFailure(err, stage);
      if (isLastAttempt(job.attempts)) {
        const message = err instanceof Error ? err.message : String(err);
        const fallback =
          stage === 'extract' && extractCtx
            ? await proposeFromPreview(
                jobRef,
                extractCtx,
                failureCode,
                undefined,
                opts?.signal,
              ).catch(() => null)
            : null;
        return fallback ?? fail(job, `error: ${message}`, failureCode);
      }
      logger.warn(
        { jobId: job.id, attempts: job.attempts, failureCode },
        'ingest attempt failed, will retry',
      );
      throw err;
    }
  };
}
