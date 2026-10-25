import type { IngestJobRow, ItemRow } from '@pb/db';
import {
  RETRYABLE_FAILURES,
  SHARE_MAX_RETRIES,
  SHARES_LIST_LIMIT,
  shareChannels,
  type IngestChannel,
  type IngestJobStatus,
  type ShareChannel,
  type ShareState,
  type ShareSummary,
} from '@pb/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { conflict, gone, notFound, unprocessable } from '../errors/http-errors';
import type { IngestQueue } from '../jobs/ingest-queue';
import { isUuid, resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { CurrentUser } from '../types';

/** D196: how far back "Your shares" looks. */
export const SHARES_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SHARE_NOT_FOUND = 'Share not found';

export type ShareItemRef = Pick<ItemRow, 'id' | 'title' | 'deletedAt'>;

const STATE_BY_STATUS: Record<IngestJobStatus, ShareState> = {
  queued: 'processing',
  running: 'processing',
  proposed: 'in_review',
  published: 'published',
  discarded: 'not_added',
  failed: 'failed',
};

export const isShareChannel = (channel: IngestChannel): channel is ShareChannel =>
  (shareChannels as readonly IngestChannel[]).includes(channel);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** D197: a failed share the sharer may send again from its stored copy. */
export function canRetryJob(
  job: Pick<IngestJobRow, 'status' | 'raw' | 'retryCount' | 'failureCode'>,
): boolean {
  return (
    job.status === 'failed' &&
    job.raw !== null &&
    job.retryCount < SHARE_MAX_RETRIES &&
    (job.failureCode === null || RETRYABLE_FAILURES.includes(job.failureCode))
  );
}

/**
 * D196: the sharer's view of one job. Never carries the stored error, the shared text or the
 * provider's answer; the title comes from the card, else the page title the share came with.
 */
export function toShareSummary(
  job: IngestJobRow & { channel: ShareChannel },
  item: ShareItemRef | null,
  reviewerName: string | null,
): ShareSummary {
  const raw = job.raw;
  return {
    id: job.id,
    deckId: job.deckId,
    channel: job.channel,
    createdAt: job.createdAt.toISOString(),
    state: STATE_BY_STATUS[job.status],
    preview: {
      title: item?.title ?? raw?.title ?? null,
      host: hostOf(raw?.url),
      photoCount: raw?.images.length ?? 0,
    },
    failureCode: job.status === 'failed' ? (job.failureCode ?? 'unknown') : null,
    canRetry: canRetryJob(job),
    autoPublish: job.autoPublish ?? null,
    item: item ? { id: item.id, title: item.title, deleted: item.deletedAt !== null } : null,
    reviewedBy: reviewerName === null ? null : { displayName: reviewerName },
    reviewedAt: job.reviewedAt?.toISOString() ?? null,
  };
}

export function createSharesService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  jobs: Pick<IngestJobsRepo, 'findById' | 'listForSharer' | 'resetForRetry'>;
  items: Pick<ItemsRepo, 'findRefsByIds'>;
  users: Pick<UsersRepo, 'findById'>;
  queue: IngestQueue;
  /** D110: the same caps as `POST /ingest` (bound `createCapGuard`). */
  assertWithinCaps: (userId: string, channel: IngestChannel) => Promise<void>;
  now: () => Date;
}) {
  const { decks, memberships, jobs, items, users, queue, now } = deps;

  /** One query for the cards, one lookup per distinct reviewer. */
  async function summarize(rows: (IngestJobRow & { channel: ShareChannel })[]) {
    const itemIds = [...new Set(rows.flatMap((j) => j.resultItemId ?? []))];
    const reviewerIds = [...new Set(rows.flatMap((j) => j.reviewedBy ?? []))];
    const [refs, reviewers] = await Promise.all([
      items.findRefsByIds(itemIds),
      Promise.all(reviewerIds.map((id) => users.findById(id))),
    ]);
    const itemById = new Map(refs.map((r) => [r.id, r]));
    const nameById = new Map(reviewers.flatMap((u) => (u ? [[u.id, u.displayName] as const] : [])));
    return rows.map((job) =>
      toShareSummary(
        job,
        job.resultItemId ? (itemById.get(job.resultItemId) ?? null) : null,
        job.reviewedBy ? (nameById.get(job.reviewedBy) ?? null) : null,
      ),
    );
  }

  /** Only the sharer, while still a member of the deck, sees the job; anyone else gets 404. */
  async function loadOwn(user: CurrentUser, id: string) {
    const job = isUuid(id) ? await jobs.findById(id) : null;
    if (!job || job.userId !== user.id || !isShareChannel(job.channel)) {
      throw notFound(SHARE_NOT_FOUND);
    }
    const deck = await decks.findById(job.deckId);
    if (!deck) throw notFound(SHARE_NOT_FOUND);
    const role = await authorize(user, deck, 'deck.read', memberships, SHARE_NOT_FOUND);
    return { job: job as IngestJobRow & { channel: ShareChannel }, deck, role };
  }

  return {
    /** D196: the caller's own shares on a deck over the last 30 days, newest first. */
    async list(user: CurrentUser, deckRef: string): Promise<ShareSummary[]> {
      const deck = await resolveDeck(decks, deckRef, user);
      await authorize(user, deck, 'deck.read', memberships);
      const rows = await jobs.listForSharer({
        userId: user.id,
        deckId: deck.id,
        since: new Date(now().getTime() - SHARES_WINDOW_MS),
        channels: shareChannels,
        limit: SHARES_LIST_LIMIT,
      });
      return summarize(rows as (IngestJobRow & { channel: ShareChannel })[]);
    },

    async get(user: CurrentUser, id: string): Promise<ShareSummary> {
      const { job } = await loadOwn(user, id);
      const [summary] = await summarize([job]);
      return summary!;
    },

    /**
     * D197: sends a failed share through the pipeline again from its stored copy. Needs
     * `item.create` now, the share still stored, retries left and room under the daily caps.
     */
    async retry(user: CurrentUser, id: string): Promise<ShareSummary> {
      const { job, deck } = await loadOwn(user, id);
      await authorize(user, deck, 'item.create', memberships, SHARE_NOT_FOUND);
      if (job.status !== 'failed') {
        throw conflict('This share is not failed', '/problems/share-not-failed');
      }
      if (job.raw === null || job.failureCode === 'content_expired') {
        throw gone('This share is no longer stored; share it again', '/problems/share-expired');
      }
      if (job.retryCount >= SHARE_MAX_RETRIES) {
        throw unprocessable(
          `A share can be retried at most ${SHARE_MAX_RETRIES} times`,
          '/problems/share-retry-limit',
        );
      }
      await deps.assertWithinCaps(user.id, job.channel);

      const reset = await jobs.resetForRetry(job.id, now());
      // Lost a race with another tap (or the prune): the row no longer qualifies.
      if (!reset) throw conflict('This share is not failed', '/problems/share-not-failed');
      await queue.enqueue(reset.id);
      const [summary] = await summarize([reset as IngestJobRow & { channel: ShareChannel }]);
      return summary!;
    },
  };
}

export type SharesService = ReturnType<typeof createSharesService>;
