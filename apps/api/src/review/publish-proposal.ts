import type { Db, ItemRow } from '@pb/db';
import type { AutoPublishOutcome } from '@pb/shared';
import type { ItemEventInput } from '../events/item-event';
import { createCategoriesRepo, type CategoriesRepo } from '../repositories/categories.repo';
import { createIngestJobsRepo, type IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import { createItemsRepo, type ItemsRepo } from '../repositories/items.repo';
import type { ImageReferenceCheck } from '../services/image-reference';

/** Repos bound to one transaction: publish/discard change the item, categories and job together. */
export interface ReviewTxRepos {
  items: Pick<ItemsRepo, 'findById' | 'update' | 'softDelete' | 'categoryIdsFor'>;
  categories: Pick<CategoriesRepo, 'findBySlug' | 'create' | 'maxPosition'>;
  jobs: Pick<IngestJobsRepo, 'update'>;
}

export type ReviewTransaction = <T>(fn: (repos: ReviewTxRepos) => Promise<T>) => Promise<T>;

/** Publish/discard change the item, its categories and the job in one commit (D95 trigger). */
export function reviewTransaction(db: Db): ReviewTransaction {
  return (fn) =>
    db.transaction((tx) =>
      fn({
        items: createItemsRepo(tx),
        categories: createCategoriesRepo(tx),
        jobs: createIngestJobsRepo(tx),
      }),
    );
}

export interface PublishProposalDeps {
  transaction: ReviewTransaction;
  /** D160: a published image card references a recorded asset of its deck. */
  imageReference: ImageReferenceCheck;
  now: () => Date;
}

export interface PublishProposalInput {
  /** The proposal; the caller has checked it is still `proposed`. */
  item: ItemRow;
  jobId: string | null;
  /** D187: the `published` line (a reviewer's session, or the sharer `via: 'ingest'`). */
  event: ItemEventInput;
  /** Recorded as the job's `reviewedBy`. */
  reviewerId: string;
  /** Categories added inside the transaction (a suggested category created on demand). */
  extraCategories?: (tx: ReviewTxRepos) => Promise<string[]>;
  /** D193: recorded on the job in the same commit when the worker publishes a share. */
  autoPublish?: AutoPublishOutcome;
}

/**
 * D106/D193: publishes a proposal as a new card — the D160 image check, then the item
 * (`published`, `verifiedAt`), its log line and the job (`published`, reviewer) in one commit
 * (D95 is checked there). Used by review and by the worker's auto-publish so nothing downstream
 * can tell them apart (FR-012). After-commit work (embedding, link snapshot, page purge) is the
 * caller's. Returns the card id.
 */
export function createPublishProposal(deps: PublishProposalDeps) {
  return async function publishProposal(input: PublishProposalInput): Promise<string> {
    const { item } = input;
    const payload = await deps.imageReference(
      item.deckId,
      item.type,
      item.payload as Record<string, unknown>,
    );
    const at = deps.now();
    await deps.transaction(async (tx) => {
      const extra = input.extraCategories ? await input.extraCategories(tx) : [];
      let categoryIds: string[] | undefined;
      if (extra.length > 0) {
        const own = (await tx.items.categoryIdsFor([item.id], 'owner')).get(item.id) ?? [];
        categoryIds = [...new Set([...own, ...extra])];
      }
      await tx.items.update(
        item.id,
        item.type === 'image'
          ? { status: 'published', verifiedAt: at, payload }
          : { status: 'published', verifiedAt: at },
        categoryIds,
        [input.event],
      );
      if (input.jobId) {
        await tx.jobs.update(input.jobId, {
          status: 'published',
          reviewedBy: input.reviewerId,
          reviewedAt: at,
          ...(input.autoPublish ? { autoPublish: input.autoPublish } : {}),
        });
      }
    });
    return item.id;
  };
}

export type PublishProposal = ReturnType<typeof createPublishProposal>;
