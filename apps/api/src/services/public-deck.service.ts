import type { CategoryRow, DeckRow, ItemRow } from '@pb/db';
import {
  decodeCursor,
  encodeCursor,
  type PublicDeck,
  type PublicItem,
  type PublicItemListQuery,
  type PublicItemPage,
} from '@pb/shared';
import { notFound } from '../errors/http-errors';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { isUuid } from '../lib/resolve-deck';
import { toPublicItem } from './public-dtos';

/** D174: anonymous readers have no role, so every read below sees `public` categories only. */
const ANONYMOUS = null;

export type PublicDeckRow = DeckRow & { kind: PublicDeck['kind'] };

/** D174: a deck strangers may read: live, public and not personal. */
export function isPublicDeck(deck: DeckRow | null): deck is PublicDeckRow {
  return deck !== null && deck.isPublic && deck.kind !== 'personal' && !deck.isDefault;
}

export function createPublicDeckService({
  decks,
  categories,
  items,
}: {
  decks: Pick<DecksRepo, 'findBySlug' | 'findById'>;
  categories: Pick<CategoriesRepo, 'listByDeck' | 'countPublished' | 'findBySlug'>;
  items: Pick<ItemsRepo, 'list' | 'findById' | 'isVisibleTo' | 'categoryIdsFor'>;
}) {
  /** D174: every "not public" reason answers the member routes' one 404. */
  async function resolvePublicDeck(slug: string): Promise<PublicDeckRow> {
    const deck = await decks.findBySlug(slug);
    if (!isPublicDeck(deck)) {
      throw notFound('Deck not found');
    }
    return deck;
  }

  /** Rows → public DTOs carrying only their public categories. */
  async function toPublicItems(deckId: string, rows: ItemRow[]): Promise<PublicItem[]> {
    if (rows.length === 0) return [];
    const publicCategories = await categories.listByDeck(deckId, ANONYMOUS);
    const byId = new Map<string, CategoryRow>(publicCategories.map((c) => [c.id, c]));
    const idsByItem = await items.categoryIdsFor(
      rows.map((r) => r.id),
      ANONYMOUS,
    );

    return rows.map((row) => {
      const cats = (idsByItem.get(row.id) ?? [])
        .map((id) => byId.get(id))
        .filter((c): c is CategoryRow => c !== undefined);
      return toPublicItem(row, cats);
    });
  }

  async function summaryFor(deck: PublicDeckRow): Promise<PublicDeck> {
    const [cats, counts] = await Promise.all([
      categories.listByDeck(deck.id, ANONYMOUS),
      categories.countPublished(deck.id, ANONYMOUS),
    ]);
    return {
      slug: deck.slug,
      name: deck.name,
      kind: deck.kind,
      categories: cats.map((c) => ({
        slug: c.slug,
        name: c.name,
        itemCount: counts.get(c.id) ?? 0,
      })),
    };
  }

  async function listFor(deck: PublicDeckRow, q: PublicItemListQuery): Promise<PublicItemPage> {
    let categoryId: string | undefined;
    if (q.category) {
      const category = await categories.findBySlug(deck.id, q.category, ANONYMOUS);
      if (!category) throw notFound('Category not found');
      categoryId = category.id;
    }

    const rows = await items.list({
      role: ANONYMOUS,
      deckId: deck.id,
      status: 'published',
      categoryId,
      cursor: q.cursor ? decodeCursor(q.cursor) : undefined,
      limit: q.limit + 1,
    });

    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > q.limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { data: await toPublicItems(deck.id, page), nextCursor };
  }

  return {
    resolvePublicDeck,
    toPublicItems,

    async summary(slug: string): Promise<PublicDeck> {
      return await summaryFor(await resolvePublicDeck(slug));
    },

    async list(slug: string, q: PublicItemListQuery): Promise<PublicItemPage> {
      return await listFor(await resolvePublicDeck(slug), q);
    },

    summaryFor,
    listFor,

    /**
     * D177: a card by id in whichever public deck holds it (card permalinks follow the deck's
     * current slug). Null for anything strangers can't read.
     */
    async itemById(itemId: string): Promise<{ deck: PublicDeckRow; item: PublicItem } | null> {
      const row = isUuid(itemId) ? await items.findById(itemId) : null;
      if (!row || row.status !== 'published') return null;
      const deck = await decks.findById(row.deckId);
      if (!isPublicDeck(deck) || !(await items.isVisibleTo(row.id, ANONYMOUS))) return null;
      const [dto] = await toPublicItems(deck.id, [row]);
      return { deck, item: dto! };
    },

    async get(slug: string, itemId: string): Promise<PublicItem> {
      const deck = await resolvePublicDeck(slug);
      const row = isUuid(itemId) ? await items.findById(itemId) : null;
      if (
        !row ||
        row.deckId !== deck.id ||
        row.status !== 'published' ||
        !(await items.isVisibleTo(row.id, ANONYMOUS))
      ) {
        throw notFound('Item not found');
      }
      const [dto] = await toPublicItems(deck.id, [row]);
      return dto!;
    },
  };
}

export type PublicDeckService = ReturnType<typeof createPublicDeckService>;
