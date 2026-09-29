import type { ItemRow } from '@pb/db';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import {
  decodeCursor,
  encodeCursor,
  type Item,
  type ItemCreate,
  type ItemListQuery,
  type ItemPage,
  type ItemPatch,
  payloadSchemaFor,
} from '@pb/shared';
import { assertDeckAccess } from '../access/assert-deck-access';
import { badRequest, notFound, unprocessable } from '../errors/http-errors';
import { resolveDeck } from '../lib/resolve-deck';
import { toItemDto } from '../lib/mappers';
import { type CurrentUser } from '../types';

export function createItemsService(deps: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  items: ItemsRepo;
  favorites: FavoritesRepo;
}) {
  const { decks, categories, items, favorites } = deps;

  // Private helpers

  async function loadOwnedItem(user: CurrentUser, itemId: string) {
    const item = await items.findById(itemId);
    if (!item) throw notFound('Item not found');

    const deck = await decks.findById(item.deckId);
    if (!deck) throw notFound('Item not found');

    assertDeckAccess(user, deck, 'read');
    return item;
  }

  async function validateCategoryIds(deckId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const existing = await categories.findExistingIds(deckId, unique);
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

  async function toDtos(user: CurrentUser, rows: ItemRow[]) {
    if (rows.length === 0) return [];

    const itemIds = rows.map((r) => r.id);
    const categoryIdsMap = await items.categoryIdsFor(itemIds);
    const favoriteIds = await favorites.favoritedAmong(user.id, itemIds);

    return rows.map((row) =>
      toItemDto(row, categoryIdsMap.get(row.id) ?? [], favoriteIds.has(row.id)),
    );
  }

  // Service methods

  return {
    async list(user: CurrentUser, idOrSlug: string, q: ItemListQuery): Promise<ItemPage> {
      const deck = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, deck, 'read');

      let categoryId: string | undefined;
      if (q.category) {
        const cat = await categories.findBySlug(deck.id, q.category);
        if (!cat) throw notFound('Category not found');
        categoryId = cat.id;
      }

      const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;

      // Fetch limit+1 to check if there are more
      const rows = await items.list({
        deckId: deck.id,
        status: q.status,
        type: q.type,
        categoryId,
        cursor,
        limit: q.limit + 1,
      });

      const hasMore = rows.length > q.limit;
      const data = rows.slice(0, q.limit);

      let nextCursor: string | null = null;
      if (hasMore && data.length > 0) {
        const lastItem = data[data.length - 1];
        nextCursor = encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id });
      }

      const itemDtos = await toDtos(user, data);

      return {
        data: itemDtos,
        nextCursor,
      };
    },

    async create(user: CurrentUser, idOrSlug: string, input: ItemCreate): Promise<Item> {
      const deck = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, deck, 'write');

      // Determine category IDs (D6)
      let categoryIds = input.categoryIds ?? [];
      if (categoryIds.length === 0) {
        const defaultCat = await categories.findDefault(deck.id);
        if (defaultCat) {
          categoryIds = [defaultCat.id];
        }
      } else {
        categoryIds = await validateCategoryIds(deck.id, categoryIds);
      }

      // Status default (D13)
      const status = input.status ?? 'published';
      const verifiedAt = status === 'published' ? new Date() : null;
      const sourceKind = input.type === 'link' || input.sourceUrl ? 'link' : 'manual';

      const createdItem = await items.create(
        {
          deckId: deck.id,
          type: input.type,
          status,
          title: input.title,
          body: input.body,
          payload: input.payload,
          sourceUrl: input.sourceUrl ?? null,
          sourceKind,
          verifiedAt,
          createdBy: user.id,
        },
        categoryIds,
      );

      const itemDtos = await toDtos(user, [createdItem]);
      return itemDtos[0];
    },

    async get(user: CurrentUser, itemId: string): Promise<Item> {
      const item = await loadOwnedItem(user, itemId);
      const itemDtos = await toDtos(user, [item]);
      return itemDtos[0];
    },

    async update(user: CurrentUser, itemId: string, patch: ItemPatch): Promise<Item> {
      const item = await loadOwnedItem(user, itemId);

      // D12: type is immutable (defensive)
      if ('type' in patch) {
        throw badRequest('Item type is immutable');
      }

      // Validate payload if provided
      if (patch.payload !== undefined) {
        payloadSchemaFor(item.type).parse(patch.payload);
      }

      // Compute resulting status and categories before writing
      const resultingStatus = patch.status ?? item.status;

      const categoryIdsMap = await items.categoryIdsFor([item.id]);
      const currentCategoryIds = categoryIdsMap.get(item.id) ?? [];
      const resultingCategoryIds =
        patch.categoryIds !== undefined
          ? await validateCategoryIds(item.deckId, patch.categoryIds)
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
      if (patch.payload !== undefined) updatePatch.payload = patch.payload;
      if (patch.sourceUrl !== undefined) updatePatch.sourceUrl = patch.sourceUrl;
      if (patch.status !== undefined) updatePatch.status = patch.status;

      // verifiedAt: only set when transitioning to 'published' from another status
      if (patch.status === 'published' && item.status !== 'published') {
        updatePatch.verifiedAt = new Date();
      }

      const updatedItem = await items.update(
        item.id,
        updatePatch,
        patch.categoryIds !== undefined ? resultingCategoryIds : undefined,
      );

      const itemDtos = await toDtos(user, [updatedItem]);
      return itemDtos[0];
    },

    async remove(user: CurrentUser, itemId: string): Promise<void> {
      const item = await loadOwnedItem(user, itemId);
      await items.softDelete(item.id);
    },

    async archive(user: CurrentUser, itemId: string): Promise<Item> {
      const item = await loadOwnedItem(user, itemId);

      // Idempotent: if already archived, return current DTO without writing
      if (item.status === 'archived') {
        const itemDtos = await toDtos(user, [item]);
        return itemDtos[0];
      }

      const archived = await items.update(item.id, { status: 'archived' });
      const itemDtos = await toDtos(user, [archived]);
      return itemDtos[0];
    },
  };
}

export type ItemsService = ReturnType<typeof createItemsService>;
