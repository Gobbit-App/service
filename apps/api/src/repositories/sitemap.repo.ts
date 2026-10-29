import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { categories, decks, itemCategories, items, type DbExecutor } from '@gobbit/db';
import { itemHasVisibleCategory } from '../access/visibility';

/** D179: anonymous readers have no role. */
const ANONYMOUS = null;

/** A live public card, as strangers can read it. */
const publishedPublicItem = and(
  eq(items.status, 'published'),
  isNull(items.deletedAt),
  itemHasVisibleCategory(ANONYMOUS),
);

/** D179: the rows behind `/sitemap.xml`. Communal public decks only; public content only. */
export function createSitemapRepo(db: DbExecutor) {
  return {
    async communalPublicDecks(): Promise<{ id: string; slug: string }[]> {
      return await db
        .select({ id: decks.id, slug: decks.slug })
        .from(decks)
        .where(
          and(
            eq(decks.isPublic, true),
            eq(decks.kind, 'communal'),
            eq(decks.isDefault, false),
            isNull(decks.deletedAt),
          ),
        )
        .orderBy(decks.slug);
    },

    /** Public cards of a deck, newest first, with their last change. */
    async publicItems(deckId: string): Promise<{ id: string; updatedAt: Date }[]> {
      return await db
        .select({ id: items.id, updatedAt: items.updatedAt })
        .from(items)
        .where(and(eq(items.deckId, deckId), publishedPublicItem))
        .orderBy(desc(items.createdAt), desc(items.id));
    },

    /** Live public categories of a deck with the newest public card's change (null when empty). */
    async publicCategories(deckId: string): Promise<{ slug: string; lastmod: Date | null }[]> {
      const rows = await db
        .select({
          slug: categories.slug,
          lastmod: sql<
            string | null
          >`max(${items.updatedAt}) filter (where ${publishedPublicItem})`,
        })
        .from(categories)
        .leftJoin(itemCategories, eq(itemCategories.categoryId, categories.id))
        .leftJoin(items, eq(items.id, itemCategories.itemId))
        .where(
          and(
            eq(categories.deckId, deckId),
            eq(categories.visibility, 'public'),
            isNull(categories.deletedAt),
          ),
        )
        .groupBy(categories.id, categories.slug, categories.position)
        .orderBy(categories.position, categories.slug);
      return rows.map((r) => ({ slug: r.slug, lastmod: r.lastmod ? new Date(r.lastmod) : null }));
    },
  };
}

export type SitemapRepo = ReturnType<typeof createSitemapRepo>;
