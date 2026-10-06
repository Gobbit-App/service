import { asc, desc, eq } from 'drizzle-orm';
import { categories, decks, itemCategories, items, ogImages, type Db } from '@pb/db';
import type { CategoryVisibility, DeckKind, ItemStatus, ItemType } from '@pb/shared';

/** Everything `/s/:itemId` needs to decide the share mode and build the preview (D58–D60). */
export type ShareRecord = {
  item: {
    id: string;
    type: ItemType;
    status: ItemStatus;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    deletedAt: Date | null;
  };
  deck: { name: string; kind: DeckKind; isPublic: boolean };
  /** Default category first, then by position. */
  categories: { name: string; visibility: CategoryVisibility }[];
};

export type OgImageRecord = { itemId: string; contentHash: string; publicId: string };

export function createShareRepo(db: Db) {
  return {
    /** Unscoped read (no membership): callers must only expose what `shareMode` allows. */
    async findRecord(itemId: string): Promise<ShareRecord | null> {
      const [row] = await db
        .select({
          id: items.id,
          type: items.type,
          status: items.status,
          title: items.title,
          body: items.body,
          payload: items.payload,
          deletedAt: items.deletedAt,
          deckName: decks.name,
          deckKind: decks.kind,
          deckIsPublic: decks.isPublic,
        })
        .from(items)
        .innerJoin(decks, eq(decks.id, items.deckId))
        .where(eq(items.id, itemId))
        .limit(1);

      if (!row) return null;

      const cats = await db
        .select({ name: categories.name, visibility: categories.visibility })
        .from(itemCategories)
        .innerJoin(categories, eq(categories.id, itemCategories.categoryId))
        .where(eq(itemCategories.itemId, itemId))
        .orderBy(desc(categories.isDefault), asc(categories.position), asc(categories.name));

      return {
        item: {
          id: row.id,
          type: row.type,
          status: row.status,
          title: row.title,
          body: row.body,
          payload: row.payload as Record<string, unknown>,
          deletedAt: row.deletedAt,
        },
        deck: { name: row.deckName, kind: row.deckKind, isPublic: row.deckIsPublic },
        categories: cats,
      };
    },

    async findOgImage(itemId: string): Promise<OgImageRecord | null> {
      const [row] = await db
        .select({
          itemId: ogImages.itemId,
          contentHash: ogImages.contentHash,
          publicId: ogImages.publicId,
        })
        .from(ogImages)
        .where(eq(ogImages.itemId, itemId))
        .limit(1);
      return row ?? null;
    },

    /** A changed hash replaces the row (D60). */
    async saveOgImage(record: OgImageRecord): Promise<void> {
      await db
        .insert(ogImages)
        .values(record)
        .onConflictDoUpdate({
          target: ogImages.itemId,
          set: {
            contentHash: record.contentHash,
            publicId: record.publicId,
            createdAt: new Date(),
          },
        });
    },
  };
}

export type ShareRepo = ReturnType<typeof createShareRepo>;
