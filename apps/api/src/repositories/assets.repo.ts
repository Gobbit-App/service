import { and, asc, eq, getTableColumns, inArray, lt, sql } from 'drizzle-orm';
import { assets, items, type AssetRow, type DbExecutor, type NewAssetRow } from '@pb/db';

export type NewAsset = Omit<NewAssetRow, 'id' | 'createdAt'>;

/** One sweep candidate (D158). */
export interface OrphanAsset {
  id: string;
  publicId: string;
}

/**
 * True when no item of any status references the asset: proposed, published, archived and
 * soft-deleted rows all count until their payload changes or the purge (D132) removes them.
 */
const unreferenced = sql`NOT EXISTS (
  SELECT 1 FROM ${items} i
  WHERE i.type = 'image' AND i.payload->>'publicId' = ${assets.publicId}
)`;

/** D156: the registry of every image Gobbit stored. */
export function createAssetsRepo(db: DbExecutor) {
  return {
    /**
     * Records an upload. A repeat for the same deck fills null dimensions and returns the row
     * with `created: false`; `null` when the public id is already recorded for another deck.
     */
    async upsert(v: NewAsset): Promise<{ row: AssetRow; created: boolean } | null> {
      const [row] = await db
        .insert(assets)
        .values(v)
        .onConflictDoUpdate({
          target: assets.publicId,
          set: {
            width: sql`coalesce(${assets.width}, excluded.width)`,
            height: sql`coalesce(${assets.height}, excluded.height)`,
            bytes: sql`coalesce(${assets.bytes}, excluded.bytes)`,
            format: sql`coalesce(${assets.format}, excluded.format)`,
          },
          setWhere: eq(assets.deckId, v.deckId),
        })
        .returning({ ...getTableColumns(assets), created: sql<boolean>`(xmax = 0)` });
      if (!row) return null;
      const { created, ...rest } = row;
      return { row: rest, created };
    },

    async byPublicId(publicId: string): Promise<AssetRow | null> {
      const [row] = await db.select().from(assets).where(eq(assets.publicId, publicId)).limit(1);
      return row ?? null;
    },

    /** The subset of `publicIds` that has an asset row (`media:reconcile`). */
    async recordedAmong(publicIds: string[]): Promise<Set<string>> {
      if (publicIds.length === 0) return new Set();
      const rows = await db
        .select({ publicId: assets.publicId })
        .from(assets)
        .where(inArray(assets.publicId, publicIds));
      return new Set(rows.map((r) => r.publicId));
    },

    /** Unreferenced assets older than `cutoff`, oldest first (D158). */
    async orphans(cutoff: Date, limit: number): Promise<OrphanAsset[]> {
      return await db
        .select({ id: assets.id, publicId: assets.publicId })
        .from(assets)
        .where(and(lt(assets.createdAt, cutoff), unreferenced))
        .orderBy(asc(assets.createdAt))
        .limit(limit);
    },

    /**
     * Deletes rows that are still unreferenced; a row that gained a reference since the sweep
     * picked it is kept (and returned as not deleted).
     */
    async deleteByIds(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0;
      const removed = await db
        .delete(assets)
        .where(and(inArray(assets.id, ids), unreferenced))
        .returning({ id: assets.id });
      return removed.length;
    },
  };
}

export type AssetsRepo = ReturnType<typeof createAssetsRepo>;
