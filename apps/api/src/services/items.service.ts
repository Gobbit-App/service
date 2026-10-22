import type { ItemRow } from '@pb/db';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import {
  type MemberRole,
  type Permission,
  ITEM_UNDELETE_DAYS,
  decodeCursor,
  encodeCursor,
  type Item,
  type ItemCreate,
  type ItemListQuery,
  type ItemPage,
  type ItemPatch,
  can,
  compactEntities,
  payloadSchemaFor,
} from '@pb/shared';
import { assertPermission, authorize, type MembershipLookup } from '../access/authorize';
import { canSeePrivate } from '../access/visibility';
import {
  badRequest,
  conflict,
  forbidden,
  gone,
  notFound,
  unprocessable,
} from '../errors/http-errors';
import { resolveDeck } from '../lib/resolve-deck';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { ImageReferenceCheck } from './image-reference';
import { createItemDtoMapper } from './item-dtos';
import type { Actor, CurrentUser } from '../types';

const DAY_MS = 86_400_000;

/** D131/D132 problem types (contracts/items-lifecycle.md). */
export const INVALID_TRANSITION_PROBLEM = '/problems/invalid-transition';
export const USE_RESTORE_PROBLEM = '/problems/use-restore';
export const UNDO_EXPIRED_PROBLEM = '/problems/undo-expired';

/**
 * Item use cases. Every method takes the acting principal first (D130/ADR-050): today always a
 * session user; Phase 6 agent tokens add another `via` without changing these signatures.
 */
export function createItemsService(deps: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  items: ItemsRepo;
  favorites: FavoritesRepo;
  memberships: MembershipLookup;
  /** D72: after each committed write, queue a re-embed when the text changed. */
  embedQueue: EmbedQueue;
  /** D160: image cards reference recorded assets of their deck; dimensions come from them. */
  imageReference: ImageReferenceCheck;
  /** D132: clock for publish/delete timestamps and the undo window (tests inject one). */
  now?: () => Date;
  undeleteDays?: number;
}) {
  const {
    decks,
    categories,
    items,
    favorites,
    memberships,
    embedQueue,
    imageReference,
    now = () => new Date(),
    undeleteDays = ITEM_UNDELETE_DAYS,
  } = deps;
  const toDtos = createItemDtoMapper({ items, favorites });
  const ITEM_NOT_FOUND = 'Item not found';

  // Private helpers

  /** D96: a proposal is visible to deck publishers and to the user who created it. */
  function canSeeProposal(
    item: { status: string; createdBy: string | null },
    user: CurrentUser,
    role: MemberRole,
  ): boolean {
    return item.status !== 'proposed' || can(role, 'item.publish') || item.createdBy === user.id;
  }

  /**
   * § 4 permission on the item's deck; a card hidden by visibility is a 404 (D38).
   * `includeDeleted` (D132, undelete only) also loads soft-deleted rows.
   */
  async function loadItem(
    user: CurrentUser,
    itemId: string,
    permission: Permission,
    opts: { includeDeleted?: boolean } = {},
  ) {
    const item = opts.includeDeleted
      ? await items.findByIdIncludingDeleted(itemId)
      : await items.findById(itemId);
    if (!item) throw notFound(ITEM_NOT_FOUND);

    const deck = await decks.findById(item.deckId);
    if (!deck) throw notFound(ITEM_NOT_FOUND);

    const role = await authorize(user, deck, permission, memberships, ITEM_NOT_FOUND);
    if (!canSeeProposal(item, user, role)) throw notFound(ITEM_NOT_FOUND);
    if (!(await items.isVisibleTo(item.id, role))) throw notFound(ITEM_NOT_FOUND);
    return { item, role };
  }

  /** Category ids of the item that `role` can't see; kept when that role rewrites the list. */
  async function hiddenCategoryIds(itemId: string, role: MemberRole): Promise<string[]> {
    if (canSeePrivate(role)) return [];
    const all = (await items.categoryIdsFor([itemId], 'owner')).get(itemId) ?? [];
    const visible = new Set((await items.categoryIdsFor([itemId], role)).get(itemId) ?? []);
    return all.filter((id) => !visible.has(id));
  }

  async function validateCategoryIds(
    deckId: string,
    ids: string[],
    role: MemberRole,
  ): Promise<string[]> {
    const unique = [...new Set(ids)];
    const existing = await categories.findExistingIds(deckId, unique, role);
    const existingSet = new Set(existing);
    const missing = unique.filter((id) => !existingSet.has(id));

    if (missing.length > 0) {
      throw badRequest(
        'Unknown categories for this deck',
        missing.map((id) => ({ path: 'categoryIds', message: id })),
      );
    }

    return unique;
  }

  async function categoryIdForSlug(
    deckId: string,
    slug: string | undefined,
    role: MemberRole,
  ): Promise<string | undefined> {
    if (!slug) return undefined;
    const cat = await categories.findBySlug(deckId, slug, role);
    if (!cat) throw notFound('Category not found');
    return cat.id;
  }

  /** Splits a `limit + 1` fetch into the page and its next cursor. */
  function paginate(
    rows: ItemRow[],
    limit: number,
    cursorOf: (last: ItemRow) => { createdAt: Date | string; id: string },
  ): { rows: ItemRow[]; nextCursor: string | null } {
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeCursor(cursorOf(last)) : null;
    return { rows: page, nextCursor };
  }

  async function toDto(user: CurrentUser, row: ItemRow, role: MemberRole): Promise<Item> {
    const [dto] = await toDtos(user, [row], role);
    return dto;
  }

  /** D131: archive/restore move published ⇄ archived only; proposals belong to the review queue. */
  function assertNotProposal(item: ItemRow, action: 'archived' | 'restored'): void {
    if (item.status === 'proposed') {
      throw conflict(
        `A proposal can't be ${action}; publish or discard it from the review queue`,
        INVALID_TRANSITION_PROBLEM,
      );
    }
  }

  // Service methods

  const service = {
    async list(actor: Actor, idOrSlug: string, q: ItemListQuery): Promise<ItemPage> {
      if (q.status === 'deleted') return service.listDeleted(actor, idOrSlug, q);

      const { user } = actor;
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'item.read', memberships);

      // D96: listing proposals is a reviewer action
      if (q.status === 'proposed' && !can(role, 'item.publish')) {
        throw forbidden('item.publish', role);
      }

      // Fetch limit+1 to check if there are more
      const rows = await items.list({
        role,
        deckId: deck.id,
        status: q.status,
        type: q.type,
        categoryId: await categoryIdForSlug(deck.id, q.category, role),
        favoriteOf: q.favorite === 'true' ? user.id : undefined,
        cursor: q.cursor ? decodeCursor(q.cursor) : undefined,
        limit: q.limit + 1,
      });

      const page = paginate(rows, q.limit, (last) => last);
      return { data: await toDtos(user, page.rows, role), nextCursor: page.nextCursor };
    },

    /**
     * D132: the deck's deleted cards inside the undo window, newest deleted first. Owners and
     * maintainers only (item.delete); proposals removed by the review queue are not listed.
     */
    async listDeleted(actor: Actor, idOrSlug: string, q: ItemListQuery): Promise<ItemPage> {
      const { user } = actor;
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'item.read', memberships);
      assertPermission(role, 'item.delete');

      // The shared cursor format carries the sort timestamp in `createdAt`.
      const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
      const rows = await items.listDeleted({
        role,
        deckId: deck.id,
        type: q.type,
        categoryId: await categoryIdForSlug(deck.id, q.category, role),
        favoriteOf: q.favorite === 'true' ? user.id : undefined,
        deletedSince: new Date(now().getTime() - undeleteDays * DAY_MS),
        after: cursor ? { deletedAt: cursor.createdAt, id: cursor.id } : undefined,
        limit: q.limit + 1,
      });

      const page = paginate(rows, q.limit, (last) => ({
        createdAt: last.deletedAt ?? last.createdAt,
        id: last.id,
      }));
      return { data: await toDtos(user, page.rows, role), nextCursor: page.nextCursor };
    },

    async create(actor: Actor, idOrSlug: string, input: ItemCreate): Promise<Item> {
      const { user } = actor;
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'item.create', memberships);

      // Determine category IDs (D6)
      let categoryIds = input.categoryIds ?? [];
      if (categoryIds.length === 0) {
        const defaultCat = await categories.findDefault(deck.id);
        if (defaultCat) {
          categoryIds = [defaultCat.id];
        }
      } else {
        categoryIds = await validateCategoryIds(deck.id, categoryIds, role);
      }

      // Status default (D13)
      const status = input.status ?? 'published';
      const verifiedAt = status === 'published' ? now() : null;
      const sourceKind = input.type === 'link' || input.sourceUrl ? 'link' : 'manual';
      const payload = await imageReference(deck.id, input.type, input.payload);

      const createdItem = await items.create(
        {
          deckId: deck.id,
          type: input.type,
          status,
          title: input.title,
          body: input.body,
          payload,
          entities: compactEntities(input.entities ?? {}),
          sourceUrl: input.sourceUrl ?? null,
          sourceKind,
          verifiedAt,
          createdBy: user.id,
        },
        categoryIds,
      );
      await embedQueue.enqueueIfStale(createdItem.id);

      return toDto(user, createdItem, role);
    },

    async get(actor: Actor, itemId: string): Promise<Item> {
      const { user } = actor;
      const { item, role } = await loadItem(user, itemId, 'item.read');
      return toDto(user, item, role);
    },

    async update(actor: Actor, itemId: string, patch: ItemPatch): Promise<Item> {
      const { user } = actor;
      const { item, role } = await loadItem(user, itemId, 'item.update');

      // D131: archived → published only through restore (keeps the first publish date)
      if (item.status === 'archived' && patch.status === 'published') {
        throw conflict(
          'An archived card is published again with POST /items/{id}/restore',
          USE_RESTORE_PROBLEM,
        );
      }

      // D131: moving to 'archived' follows the archive rules (permission, no proposals)
      if (patch.status === 'archived' && item.status !== 'archived') {
        assertNotProposal(item, 'archived');
        assertPermission(role, 'item.archive');
      }

      // § 4: publishing a proposal is a reviewer action
      if (item.status === 'proposed' && patch.status === 'published') {
        assertPermission(role, 'item.publish');
      }

      // D12: type is immutable (defensive)
      if ('type' in patch) {
        throw badRequest('Item type is immutable');
      }

      // Validate payload if provided; D160 for image cards
      if (patch.payload !== undefined) {
        payloadSchemaFor(item.type).parse(patch.payload);
      }
      const payload =
        patch.payload === undefined
          ? undefined
          : await imageReference(item.deckId, item.type, patch.payload);

      // Compute resulting status and categories before writing
      const resultingStatus = patch.status ?? item.status;

      const categoryIdsMap = await items.categoryIdsFor([item.id], 'owner');
      const currentCategoryIds = categoryIdsMap.get(item.id) ?? [];
      const resultingCategoryIds =
        patch.categoryIds !== undefined
          ? [
              ...(await validateCategoryIds(item.deckId, patch.categoryIds, role)),
              ...(await hiddenCategoryIds(item.id, role)),
            ]
          : currentCategoryIds;

      // D6: published item needs at least one category
      if (resultingStatus === 'published' && resultingCategoryIds.length === 0) {
        throw unprocessable(
          'A published item needs at least one category',
          '/problems/item-needs-category',
        );
      }

      // Build update patch
      const updatePatch: Parameters<ItemsRepo['update']>[1] = {};
      if (patch.title !== undefined) updatePatch.title = patch.title;
      if (patch.body !== undefined) updatePatch.body = patch.body;
      if (payload !== undefined) updatePatch.payload = payload;
      if (patch.entities !== undefined) updatePatch.entities = compactEntities(patch.entities);
      if (patch.sourceUrl !== undefined) updatePatch.sourceUrl = patch.sourceUrl;
      if (patch.status !== undefined) updatePatch.status = patch.status;

      // D131: verifiedAt is the first publication date; never re-set
      if (patch.status === 'published' && item.status !== 'published' && !item.verifiedAt) {
        updatePatch.verifiedAt = now();
      }

      const updatedItem = await items.update(
        item.id,
        updatePatch,
        patch.categoryIds !== undefined ? resultingCategoryIds : undefined,
      );
      await embedQueue.enqueueIfStale(updatedItem.id);

      return toDto(user, updatedItem, role);
    },

    /** Soft delete (ADR-005); the status is kept so undelete returns the card as it was (D132). */
    async remove(actor: Actor, itemId: string): Promise<void> {
      const { item } = await loadItem(actor.user, itemId, 'item.delete');
      await items.softDelete(item.id, now());
    },

    /** D131: published → archived; idempotent; 409 on a proposal. */
    async archive(actor: Actor, itemId: string): Promise<Item> {
      const { user } = actor;
      const { item, role } = await loadItem(user, itemId, 'item.archive');
      assertNotProposal(item, 'archived');

      if (item.status === 'archived') return toDto(user, item, role);

      const archived = await items.update(item.id, { status: 'archived' });
      return toDto(user, archived, role);
    },

    /** D131: archived → published keeping `verifiedAt`; idempotent; 409 on a proposal. */
    async restore(actor: Actor, itemId: string): Promise<Item> {
      const { user } = actor;
      const { item, role } = await loadItem(user, itemId, 'item.archive');
      assertNotProposal(item, 'restored');

      if (item.status === 'published') return toDto(user, item, role);

      const restored = await items.update(item.id, { status: 'published' });
      await embedQueue.enqueueIfStale(restored.id);
      return toDto(user, restored, role);
    },

    /**
     * D132: clears `deleted_at` inside the undo window (else 410 undo-expired). A live card is a
     * no-op 200; a deleted proposal belongs to the review queue and is a 404.
     */
    async undelete(actor: Actor, itemId: string): Promise<Item> {
      const { user } = actor;
      const { item, role } = await loadItem(user, itemId, 'item.delete', {
        includeDeleted: true,
      });

      if (!item.deletedAt) return toDto(user, item, role);
      if (item.status === 'proposed') throw notFound(ITEM_NOT_FOUND);

      const windowStart = now().getTime() - undeleteDays * DAY_MS;
      if (item.deletedAt.getTime() < windowStart) {
        throw gone(
          `Deleted cards can be brought back for ${undeleteDays} days`,
          UNDO_EXPIRED_PROBLEM,
        );
      }

      const restored = await items.undelete(item.id);
      await embedQueue.enqueueIfStale(restored.id);
      return toDto(user, restored, role);
    },
  };

  return service;
}

export type ItemsService = ReturnType<typeof createItemsService>;
