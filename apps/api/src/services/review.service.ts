import type { IngestJobRow, ItemRow } from '@pb/db';
import {
  can,
  REVIEW_LIMIT,
  type BulkPublishResult,
  type Item,
  type MemberRole,
  type PublishRequest,
  type ReviewCount,
  type ReviewEntry,
  type ReviewList,
} from '@pb/shared';
import { assertPermission, authorize, type MembershipLookup } from '../access/authorize';
import { badRequest, conflict, HttpError, notFound } from '../errors/http-errors';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import { resolveDeck } from '../lib/resolve-deck';
import { toSlug } from '../lib/slug';
import type { IngestUploadStore } from '../media/ingest-uploads';
import type { ImageReferenceCheck } from './image-reference';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { UsersRepo } from '../repositories/users.repo';
import {
  bulkSkipReason,
  dedupTargetId,
  mergeProposalPatch,
  sourcePreview,
} from '../review/review-helpers';
import {
  createPublishProposal,
  type ReviewTransaction,
  type ReviewTxRepos,
} from '../review/publish-proposal';
import type { Actor, CurrentUser } from '../types';
import { diffFields, itemFields } from '../events/diff-fields';
import { eventFrom } from '../events/item-event';
import type { ItemDtoMapper } from './item-dtos';
import { childLogger } from '../lib/logger';

const log = childLogger('review');

const ITEM_NOT_FOUND = 'Item not found';

export type { ReviewTransaction, ReviewTxRepos } from '../review/publish-proposal';

export function createReviewService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  users: Pick<UsersRepo, 'findById'>;
  items: Pick<ItemsRepo, 'list' | 'findById' | 'countByStatus'>;
  jobs: Pick<IngestJobsRepo, 'findByResultItem' | 'findByResultItems'>;
  toDtos: ItemDtoMapper;
  transaction: ReviewTransaction;
  uploads: IngestUploadStore | null;
  embedQueue: EmbedQueue;
  /** D163: a published link (or a merged target) gets its preview image copied. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  /** D160: a published image card references a recorded asset of its deck. */
  imageReference: ImageReferenceCheck;
  now: () => Date;
  /** D180: a publish changes the deck's public pages; drop them after commit. */
  purgeDeck?: (deckId: string) => void;
}) {
  const { decks, memberships, users, items, jobs, toDtos, transaction, embedQueue, now } = deps;
  const publishProposal = createPublishProposal(deps);

  async function reviewerDeck(user: CurrentUser, idOrSlug: string) {
    const deck = await resolveDeck(decks, idOrSlug, user);
    const role = await authorize(user, deck, 'item.publish', memberships);
    return { deck, role };
  }

  /** A live proposal the caller may publish; anything else on a visible deck is a 409. */
  async function loadProposal(user: CurrentUser, itemId: string) {
    const item = await items.findById(itemId);
    if (!item) throw notFound(ITEM_NOT_FOUND);
    const deck = await decks.findById(item.deckId);
    if (!deck) throw notFound(ITEM_NOT_FOUND);
    const role = await authorize(user, deck, 'item.publish', memberships, ITEM_NOT_FOUND);
    if (item.status !== 'proposed') throw conflict('Only proposed items can be reviewed');
    const job = await jobs.findByResultItem(item.id);
    return { item, deck, role, job };
  }

  async function displayNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => users.findById(id)));
    return new Map(found.flatMap((u) => (u ? [[u.id, u.displayName] as const] : [])));
  }

  /** Targets of possible-duplicate/update verdicts that are still published in the same deck. */
  async function loadTargets(deckId: string, jobRows: IngestJobRow[]): Promise<ItemRow[]> {
    const ids = [...new Set(jobRows.flatMap((j) => dedupTargetId(j.dedup) ?? []))];
    const rows = await Promise.all(ids.map((id) => items.findById(id)));
    return rows.filter(
      (r): r is ItemRow => r !== null && r.deckId === deckId && r.status === 'published',
    );
  }

  /** The job's suggested category, created on demand (or reused when the slug exists). */
  async function ensureNewCategory(
    tx: ReviewTxRepos,
    deckId: string,
    role: MemberRole,
    name: string,
  ): Promise<string> {
    const slug = toSlug(name);
    if (slug === '') throw badRequest('The suggested category has no usable name');
    const existing = await tx.categories.findBySlug(deckId, slug, role);
    if (existing) return existing.id;
    const created = await tx.categories.create({
      deckId,
      slug,
      name,
      visibility: 'shared',
      position: (await tx.categories.maxPosition(deckId)) + 1,
    });
    return created.id;
  }

  /**
   * D106 `update`: copies the proposal onto its dedup target (one `merged` line there) and
   * soft-deletes the proposal; the job is marked published by the reviewer. Returns the target id.
   */
  async function mergeIntoTarget(
    actor: Actor,
    proposal: ItemRow,
    targetId: string,
    jobId: string | null,
    ensureSuggested?: (tx: ReviewTxRepos) => Promise<string[]>,
  ): Promise<string> {
    const payload = await deps.imageReference(
      proposal.deckId,
      proposal.type,
      proposal.payload as Record<string, unknown>,
    );
    const item = { ...proposal, payload };
    const at = now();
    return transaction(async (tx) => {
      const extra = ensureSuggested ? await ensureSuggested(tx) : [];
      const own = (await tx.items.categoryIdsFor([item.id], 'owner')).get(item.id) ?? [];
      const categoryIds = [...new Set([...own, ...extra])];

      const target = await tx.items.findById(targetId);
      if (!target || target.deckId !== item.deckId) {
        throw conflict('The card this proposal updates no longer exists');
      }
      if (target.status !== 'published') {
        throw conflict('The card this proposal updates is archived or deleted');
      }
      const patch = mergeProposalPatch(item, target, at);
      const targetCategoryIds =
        (await tx.items.categoryIdsFor([target.id], 'owner')).get(target.id) ?? [];
      const before = itemFields(target, targetCategoryIds);
      const changes = diffFields(before, {
        ...before,
        ...patch,
        categoryIds: categoryIds.length > 0 ? categoryIds : targetCategoryIds,
      });
      await tx.items.update(target.id, patch, categoryIds.length > 0 ? categoryIds : undefined, [
        eventFrom(actor, 'merged', changes),
      ]);
      await tx.items.softDelete(item.id);
      if (jobId) {
        await tx.jobs.update(jobId, {
          status: 'published',
          reviewedBy: actor.user.id,
          reviewedAt: at,
        });
      }
      return target.id;
    });
  }

  async function toDto(user: CurrentUser, itemId: string, role: MemberRole): Promise<Item> {
    const row = await items.findById(itemId);
    if (!row) throw notFound(ITEM_NOT_FOUND);
    const [dto] = await toDtos(user, [row], role);
    return dto!;
  }

  const service = {
    /**
     * D106: newest proposals first (≤ REVIEW_LIMIT) with their job and dedup target.
     * D191: `source` keeps the proposals of one import (their job's client label).
     */
    async list(user: CurrentUser, idOrSlug: string, source?: string): Promise<ReviewList> {
      const { deck, role } = await reviewerDeck(user, idOrSlug);
      const [rows, count] = await Promise.all([
        items.list({
          role,
          deckId: deck.id,
          status: 'proposed',
          limit: REVIEW_LIMIT,
          ...(source !== undefined ? { clientLabel: source } : {}),
        }),
        items.countByStatus(deck.id, 'proposed'),
      ]);
      const jobRows = await jobs.findByResultItems(rows.map((r) => r.id));
      const jobByItem = new Map(jobRows.map((j) => [j.resultItemId, j]));
      const [names, targets, itemDtos] = await Promise.all([
        displayNames(jobRows.flatMap((j) => j.userId ?? [])),
        loadTargets(deck.id, jobRows),
        toDtos(user, rows, role),
      ]);
      const targetDtos = new Map(
        (await toDtos(user, targets, role)).map((t) => [t.id, t] as const),
      );

      const data: ReviewEntry[] = itemDtos.map((item) => {
        const job = jobByItem.get(item.id);
        const targetId = dedupTargetId(job?.dedup);
        return {
          item,
          job: job
            ? {
                id: job.id,
                channel: job.channel,
                sharedBy:
                  job.userId && names.has(job.userId)
                    ? { id: job.userId, displayName: names.get(job.userId)! }
                    : null,
                clientLabel: job.clientLabel ?? null,
                createdAt: job.createdAt.toISOString(),
                dedup: job.dedup ?? null,
                newCategory: job.extraction?.newCategory ?? null,
                sourcePreview: sourcePreview(job),
                autoPublish: job.autoPublish ?? null,
              }
            : null,
          target: (targetId && targetDtos.get(targetId)) || null,
        };
      });
      return { data, count };
    },

    /** D107: the pill on the deck header. */
    async count(user: CurrentUser, idOrSlug: string): Promise<ReviewCount> {
      const { deck } = await reviewerDeck(user, idOrSlug);
      return { count: await items.countByStatus(deck.id, 'proposed') };
    },

    /**
     * D106: `new` publishes the proposal; `update` copies it onto the dedup target and soft-deletes
     * the proposal. Category, item, job and log changes commit together (D95 is checked at commit).
     * D187: `published` on the new card, or one `merged` line on the target (none for the proposal).
     */
    async publish(actor: Actor, itemId: string, req: PublishRequest): Promise<Item> {
      const { user } = actor;
      const loaded = await loadProposal(user, itemId);
      const { role, job } = loaded;
      const suggested = req.createCategory ? (job?.extraction?.newCategory ?? null) : null;
      if (req.createCategory) {
        if (!suggested) throw badRequest('This proposal has no suggested category');
        assertPermission(role, 'category.create');
      }
      const ensureSuggested = suggested
        ? async (tx: ReviewTxRepos) => [
            await ensureNewCategory(tx, loaded.item.deckId, role, suggested),
          ]
        : undefined;

      let resultId: string;
      if (req.mode === 'update') {
        const targetId = dedupTargetId(job?.dedup);
        if (!targetId) throw badRequest('This proposal has no card to update');
        resultId = await mergeIntoTarget(
          actor,
          loaded.item,
          targetId,
          job?.id ?? null,
          ensureSuggested,
        );
      } else {
        resultId = await publishProposal({
          item: loaded.item,
          jobId: job?.id ?? null,
          event: eventFrom(actor, 'published'),
          reviewerId: user.id,
          extraCategories: ensureSuggested,
        });
      }
      const item = loaded.item;

      deps.purgeDeck?.(item.deckId);
      await embedQueue.enqueueIfStale(resultId);
      if (deps.linkSnapshotQueue) {
        const published = await items.findById(resultId);
        if (published) await deps.linkSnapshotQueue.enqueueIfNeeded(published);
      }
      return toDto(user, resultId, role);
    },

    /**
     * D191: publishes each proposal as is, one transaction per card so one failure keeps the
     * rest. A suggested category is created like the single review's default; flagged
     * duplicates and updates are left for a decision.
     */
    async publishMany(actor: Actor, idOrSlug: string, ids: string[]): Promise<BulkPublishResult> {
      const { deck, role } = await reviewerDeck(actor.user, idOrSlug);
      const result: BulkPublishResult = { published: [], skipped: [] };
      for (const id of ids) {
        const item = await items.findById(id);
        const job = item ? await jobs.findByResultItem(id) : null;
        const reason = bulkSkipReason(item, deck.id, job);
        if (reason) {
          result.skipped.push({ id, reason });
          continue;
        }
        const createCategory =
          Boolean(job?.extraction?.newCategory) && can(role, 'category.create');
        try {
          await service.publish(actor, id, { mode: 'new', createCategory });
          result.published.push(id);
        } catch (err) {
          // Reviewed by someone else in the meantime.
          if (!(err instanceof HttpError) || err.status !== 409) throw err;
          result.skipped.push({ id, reason: 'already-handled' });
        }
      }
      return result;
    },

    /** D106: soft-deletes the proposal, marks the job discarded and removes its uploads. */
    async discard(actor: Actor, itemId: string): Promise<void> {
      const { user } = actor;
      const { item, job } = await loadProposal(user, itemId);
      const at = now();
      await transaction(async (tx) => {
        await tx.items.softDelete(item.id, at, [eventFrom(actor, 'discarded')]);
        if (job) {
          await tx.jobs.update(job.id, {
            status: 'discarded',
            reviewedBy: user.id,
            reviewedAt: at,
          });
        }
      });

      if (job && deps.uploads && (job.raw?.images.length ?? 0) > 0) {
        await deps.uploads.deleteForJob(job.id).catch((err: unknown) => {
          // The prune job removes leftovers by tag; a failed delete must not undo the discard.
          log.error({ err, jobId: job.id }, 'deleting job uploads failed');
        });
      }
    },
  };
  return service;
}

export type ReviewService = ReturnType<typeof createReviewService>;
