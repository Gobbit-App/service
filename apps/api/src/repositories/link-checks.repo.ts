import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { items, linkChecks, type DbExecutor, type LinkCheckRow } from '@pb/db';
import type { LinkFlagStatus } from '@pb/shared';

/** One sweep candidate (D164): a live published link card and its check row, if any. */
export interface DueLink {
  itemId: string;
  url: string;
  previewTitle: string | null;
  check: LinkCheckRow | null;
}

export interface LinkFlag {
  status: LinkFlagStatus;
  checkedAt: Date;
}

export type LinkCheckWrite = Omit<LinkCheckRow, 'itemId'>;

const checkColumns = {
  itemId: linkChecks.itemId,
  status: linkChecks.status,
  httpStatus: linkChecks.httpStatus,
  error: linkChecks.error,
  titleSeen: linkChecks.titleSeen,
  consecutiveFailures: linkChecks.consecutiveFailures,
  checkedAt: linkChecks.checkedAt,
  nextCheckAt: linkChecks.nextCheckAt,
  flaggedAt: linkChecks.flaggedAt,
  dismissedAt: linkChecks.dismissedAt,
};

/** An active flag: `dead` or `changed`, not dismissed (D165). */
const activeFlag = and(
  inArray(linkChecks.status, ['dead', 'changed']),
  sql`${linkChecks.flaggedAt} IS NOT NULL`,
  isNull(linkChecks.dismissedAt),
);

/** D164/D165: link check state, kept out of `items` so checks never move `updated_at`. */
export function createLinkChecksRepo(db: DbExecutor) {
  return {
    /** Published live link cards never checked or due by `now`, never-checked first. */
    async due(now: Date, limit: number): Promise<DueLink[]> {
      const rows = await db
        .select({
          itemId: items.id,
          url: sql<string>`${items.payload}->>'url'`,
          previewTitle: sql<string | null>`${items.payload} #>> '{preview,title}'`,
          check: checkColumns,
        })
        .from(items)
        .leftJoin(linkChecks, eq(linkChecks.itemId, items.id))
        .where(
          and(
            eq(items.type, 'link'),
            eq(items.status, 'published'),
            isNull(items.deletedAt),
            or(isNull(linkChecks.itemId), lte(linkChecks.nextCheckAt, now)),
          ),
        )
        .orderBy(sql`${linkChecks.nextCheckAt} ASC NULLS FIRST`, asc(items.id))
        .limit(limit);
      return rows.map((r) => ({
        itemId: r.itemId,
        url: r.url,
        previewTitle: r.previewTitle,
        check: r.check?.itemId ? (r.check as LinkCheckRow) : null,
      }));
    },

    async find(itemId: string): Promise<LinkCheckRow | null> {
      const [row] = await db
        .select()
        .from(linkChecks)
        .where(eq(linkChecks.itemId, itemId))
        .limit(1);
      return row ?? null;
    },

    /** Writes the whole row; the service computes it from the previous one. */
    async upsert(itemId: string, v: LinkCheckWrite): Promise<LinkCheckRow> {
      const [row] = await db
        .insert(linkChecks)
        .values({ itemId, ...v })
        .onConflictDoUpdate({ target: linkChecks.itemId, set: v })
        .returning();
      return row!;
    },

    /** Active flags among `itemIds` (one lookup per page, D165). */
    async flagsFor(itemIds: string[]): Promise<Map<string, LinkFlag>> {
      const result = new Map<string, LinkFlag>();
      if (itemIds.length === 0) return result;
      const rows = await db
        .select({
          itemId: linkChecks.itemId,
          status: linkChecks.status,
          checkedAt: linkChecks.checkedAt,
        })
        .from(linkChecks)
        .where(and(inArray(linkChecks.itemId, itemIds), activeFlag));
      for (const r of rows) {
        result.set(r.itemId, { status: r.status as LinkFlagStatus, checkedAt: r.checkedAt });
      }
      return result;
    },

    /** Dismisses an active flag; false when there is none. */
    async dismiss(itemId: string, at: Date): Promise<boolean> {
      const updated = await db
        .update(linkChecks)
        .set({ dismissedAt: at })
        .where(and(eq(linkChecks.itemId, itemId), activeFlag))
        .returning({ itemId: linkChecks.itemId });
      return updated.length > 0;
    },
  };
}

export type LinkChecksRepo = ReturnType<typeof createLinkChecksRepo>;
