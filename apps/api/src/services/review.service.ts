import type { IngestJobRow, ItemRow } from '@pb/db';
import {
  REVIEW_LIMIT,
  type Item,
  type MemberRole,
  type PublishRequest,
  type ReviewCount,
  type ReviewEntry,
  type ReviewList,
} from '@pb/shared';
import { assertPermission, authorize, type MembershipLookup } from '../access/authorize';
import { badRequest, conflict, notFound } from '../errors/http-errors';
import type { EmbedQueue } from '../jobs/embed-queue';
import { resolveDeck } from '../lib/resolve-deck';
import { toSlug } from '../lib/slug';
import type { IngestUploadStore } from '../media/ingest-uploads';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { UsersRepo } from '../repositories/users.repo';
import { dedupTargetId, mergeProposalPatch, sourcePreview } from '../review/review-helpers';
import type { CurrentUser } from '../types';
import type { ItemDtoMapper } from './item-dtos';

const ITEM_NOT_FOUND = 'Item not found';

/** Repos bound to one transaction: publish/discard change the item, categories and job together. */
export interface ReviewTxRepos {
  items: Pick<ItemsRepo, 'findById' | 'update' | 'softDelete' | 'categoryIdsFor'>;
  categories: Pick<CategoriesRepo, 'findBySlug' | 'create' | 'maxPosition'>;
  jobs: Pick<IngestJobsRepo, 'update'>;
}

export type ReviewTransaction = <T>(fn: (repos: ReviewTxRepos) => Promise<T>) => Promise<T>;

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
  now: () => Date;
}) {
  const { decks, memberships, users, items, jobs, toDtos, transaction, embedQueue, now } = deps;

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

  async function toDto(user: CurrentUser, itemId: string, role: MemberRole): Promise<Item> {
    const row = await items.findById(itemId);
    if (!row) throw notFound(ITEM_NOT_FOUND);
    const [dto] = await toDtos(user, [row], role);
    return dto!;
  }

  return {
    /** D106: newest proposals first (≤ REVIEW_LIMIT) with their job and dedup target. */
    async list(user: CurrentUser, idOrSlug: string): Promise<ReviewList> {
      const { deck, role } = await reviewerDeck(user, idOrSlug);
      const [rows, count] = await Promise.all([
        items.list({ role, deckId: deck.id, status: 'proposed', limit: REVIEW_LIMIT }),
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
     * the proposal. Category, item and job changes commit together (D95 is checked at commit).
     */
    async publish(user: CurrentUser, itemId: string, req: PublishRequest): Promise<Item> {
      const { item, role, job } = await loadProposal(user, itemId);
      const suggested = req.createCategory ? (job?.extraction?.newCategory ?? null) : null;
      if (req.createCategory) {
        if (!suggested) throw badRequest('This proposal has no suggested category');
        assertPermission(role, 'category.create');
      }

      let targetId: string | null = null;
      if (req.mode === 'update') {
        targetId = dedupTargetId(job?.dedup);
        if (!targetId) throw badRequest('This proposal has no card to update');
      }

      const at = now();
      const resultId = await transaction(async (tx) => {
        const extra = suggested ? [await ensureNewCategory(tx, item.deckId, role, suggested)] : [];
        const own = (await tx.items.categoryIdsFor([item.id], 'owner')).get(item.id) ?? [];
        const categoryIds = [...new Set([...own, ...extra])];

        let id = item.id;
        if (targetId) {
          const target = await tx.items.findById(targetId);
          if (!target || target.deckId !== item.deckId) {
            throw conflict('The card this proposal updates no longer exists');
          }
          if (target.status !== 'published') {
            throw conflict('The card this proposal updates is archived or deleted');
          }
          await tx.items.update(
            target.id,
            mergeProposalPatch(item, target, at),
            categoryIds.length > 0 ? categoryIds : undefined,
          );
          await tx.items.softDelete(item.id);
          id = target.id;
        } else {
          await tx.items.update(
            item.id,
            { status: 'published', verifiedAt: at },
            extra.length > 0 ? categoryIds : undefined,
          );
        }

        if (job) {
          await tx.jobs.update(job.id, {
            status: 'published',
            reviewedBy: user.id,
            reviewedAt: at,
          });
        }
        return id;
      });

      await embedQueue.enqueueIfStale(resultId);
      return toDto(user, resultId, role);
    },

    /** D106: soft-deletes the proposal, marks the job discarded and removes its uploads. */
    async discard(user: CurrentUser, itemId: string): Promise<void> {
      const { item, job } = await loadProposal(user, itemId);
      const at = now();
      await transaction(async (tx) => {
        await tx.items.softDelete(item.id);
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
          console.error(
            `[review] deleting uploads of job ${job.id} failed:`,
            err instanceof Error ? err.message : err,
          );
        });
      }
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
