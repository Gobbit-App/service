import type { ItemRow } from '@pb/db';
import {
  can,
  shareChannels,
  type AutoPublishOutcome,
  type DedupVerdict,
  type IngestChannel,
  type MemberRole,
} from '@pb/shared';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import type { Logger } from '../lib/logger';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { PublishProposal } from '../review/publish-proposal';

export interface AutoPublishDeps {
  decks: Pick<DecksRepo, 'findById'>;
  /** D33: the sharer's role now (it may have changed since the share). */
  roleOf: (deckId: string, userId: string) => Promise<MemberRole | null>;
  publishProposal: PublishProposal;
  jobs: Pick<IngestJobsRepo, 'update'>;
  embedQueue: EmbedQueue;
  linkSnapshotQueue?: LinkSnapshotQueue;
  logger: Pick<Logger, 'warn'>;
}

export interface AutoPublishInput {
  job: { id: string; deckId: string; userId: string; channel: IngestChannel };
  proposal: ItemRow;
  /** The categories the extraction chose, before the default-category fallback. */
  categoryIds: readonly string[];
  verdict: DedupVerdict | null;
}

const SHARE_CHANNELS: readonly IngestChannel[] = shareChannels;

/**
 * D193: why a share stays in review, checked in a reviewer's order (rights, category,
 * duplicate); null when it may be published directly.
 */
export function autoPublishHold(input: {
  role: MemberRole | null;
  categoryIds: readonly string[];
  verdict: DedupVerdict | null;
}): Exclude<AutoPublishOutcome, 'published' | 'held_publish_failed'> | null {
  if (!input.role || !can(input.role, 'item.publish')) return 'held_not_publisher';
  if (input.categoryIds.length === 0) return 'held_needs_category';
  if (!input.verdict) return 'held_duplicate_check_failed';
  if (input.verdict.action !== 'new') return 'held_duplicate';
  return null;
}

/**
 * D193: on a deck with `autoPublishShares`, publishes a publisher's share through the same
 * routine as review (FR-012), as the sharer `via: 'ingest'`. Records the outcome on the job;
 * off, or for MCP and import, records nothing (null). Never throws: the proposal already
 * exists, so review is the fallback.
 */
export async function autoPublish(
  deps: AutoPublishDeps,
  input: AutoPublishInput,
): Promise<AutoPublishOutcome | null> {
  const { job, proposal } = input;
  if (!SHARE_CHANNELS.includes(job.channel)) return null;

  try {
    const deck = await deps.decks.findById(job.deckId);
    if (!deck?.autoPublishShares) return null;

    const role = await deps.roleOf(job.deckId, job.userId);
    const hold = autoPublishHold({ role, categoryIds: input.categoryIds, verdict: input.verdict });
    if (hold) {
      await deps.jobs.update(job.id, { autoPublish: hold });
      return hold;
    }

    await deps.publishProposal({
      item: proposal,
      jobId: job.id,
      event: { kind: 'published', via: 'ingest', actorUserId: job.userId },
      reviewerId: job.userId,
      autoPublish: 'published',
    });
  } catch (err) {
    deps.logger.warn(
      {
        jobId: job.id,
        deckId: job.deckId,
        err: err instanceof Error ? err.name : 'unknown',
      },
      'ingest auto-publish failed, left in review',
    );
    await recordFailure(deps, job.id);
    return 'held_publish_failed';
  }

  // After commit, as review does; the public page cache expires on its own (D180).
  try {
    await deps.embedQueue.enqueueIfStale(proposal.id);
    await deps.linkSnapshotQueue?.enqueueIfNeeded({ ...proposal, status: 'published' });
  } catch (err) {
    // The embed and snapshot sweeps heal a missed enqueue (ADR-043, D163).
    deps.logger.warn(
      { jobId: job.id, deckId: job.deckId, err: err instanceof Error ? err.name : 'unknown' },
      'ingest auto-publish follow-up failed',
    );
  }
  return 'published';
}

async function recordFailure(deps: AutoPublishDeps, jobId: string): Promise<void> {
  try {
    await deps.jobs.update(jobId, { autoPublish: 'held_publish_failed' });
  } catch {
    // The job stays proposed either way; the warning above is the record.
  }
}
