import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  categories,
  decks,
  itemCategories,
  items,
  itemColumns,
  memberships,
  reminders,
  users,
  type DbExecutor,
  type DbTx,
  type ItemRow,
} from '@gobbit/db';
import type { CategoryVisibility, MemberRole, ReminderOutcome } from '@gobbit/shared';
import type { DismisserMember } from '@gobbit/shared/reminders';
import type { ItemEventInput } from '../events/item-event';
import { insertItemEvents } from './item-events.repo';

export interface ReminderStateRow {
  itemId: string;
  deadline: Date;
  outcome: ReminderOutcome;
  dismissedBy: string | null;
  dismissedAt: Date | null;
  resolution: string | null;
  notifiedDeadline: Date | null;
}

const stateColumns = {
  itemId: reminders.itemId,
  deadline: reminders.deadline,
  outcome: reminders.outcome,
  dismissedBy: reminders.dismissedBy,
  dismissedAt: reminders.dismissedAt,
  resolution: reminders.resolution,
  notifiedDeadline: reminders.notifiedDeadline,
};

/** D294: a dismissed reminder goes back to pending (restore). */
export async function reopenReminder(tx: DbTx, itemId: string): Promise<void> {
  await tx
    .update(reminders)
    .set({ outcome: 'pending', dismissedBy: null, dismissedAt: null, resolution: null })
    .where(eq(reminders.itemId, itemId));
  await markNotifiedIfPast(tx, itemId);
}

/**
 * D294: a reminder brought back (restore, undelete, publish) after its deadline is overdue in the
 * app only; it never sends a late email or push.
 */
export async function markNotifiedIfPast(tx: DbTx, itemId: string): Promise<void> {
  await tx
    .update(reminders)
    .set({ notifiedDeadline: sql`${reminders.deadline}` })
    .where(
      and(
        eq(reminders.itemId, itemId),
        sql`${reminders.deadline} <= now()`,
        sql`${reminders.notifiedDeadline} is distinct from ${reminders.deadline}`,
      ),
    );
}

export function createRemindersRepo(db: DbExecutor) {
  const repo = {
    /** D291: the server-owned state of each reminder in `itemIds`. */
    async states(itemIds: readonly string[]): Promise<Map<string, ReminderStateRow>> {
      if (itemIds.length === 0) return new Map();
      const rows = await db
        .select(stateColumns)
        .from(reminders)
        .where(inArray(reminders.itemId, [...itemIds]));
      return new Map(rows.map((r) => [r.itemId, r]));
    },

    /**
     * D293: live, accepted members of the deck with their role; users of the deck's owner account
     * are its owners. Deleted users are left out.
     */
    async deckMembers(deckId: string): Promise<DismisserMember[]> {
      const accountUsers = await db
        .select({ userId: users.id })
        .from(users)
        .innerJoin(decks, eq(decks.ownerAccountId, users.accountId))
        .where(and(eq(decks.id, deckId), isNull(users.deletedAt)));
      const members = await db
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.deckId, deckId),
            isNull(memberships.deletedAt),
            isNotNull(memberships.acceptedAt),
            isNull(users.deletedAt),
          ),
        );
      const byId = new Map<string, MemberRole>(members.map((m) => [m.userId, m.role]));
      for (const u of accountUsers) byId.set(u.userId, 'owner');
      return [...byId].map(([userId, role]) => ({ userId, role }));
    },

    /** D293: whether the deck is personal (rule forced to `me`) and its live members. */
    async deckContext(deckId: string): Promise<{ personal: boolean; members: DismisserMember[] }> {
      const [deck] = await db
        .select({ kind: decks.kind })
        .from(decks)
        .where(eq(decks.id, deckId))
        .limit(1);
      return { personal: deck?.kind === 'personal', members: await repo.deckMembers(deckId) };
    },

    /** D293: visibility of each item's live categories (all of them, whatever the caller sees). */
    async categoryVisibilities(
      itemIds: readonly string[],
    ): Promise<Map<string, CategoryVisibility[]>> {
      const result = new Map<string, CategoryVisibility[]>(itemIds.map((id) => [id, []]));
      if (itemIds.length === 0) return result;
      const rows = await db
        .select({ itemId: itemCategories.itemId, visibility: categories.visibility })
        .from(itemCategories)
        .innerJoin(categories, eq(categories.id, itemCategories.categoryId))
        .where(and(inArray(itemCategories.itemId, [...itemIds]), isNull(categories.deletedAt)));
      for (const r of rows) result.get(r.itemId)?.push(r.visibility);
      return result;
    },

    /**
     * D294: records the outcome, archives a published card and logs the event in one transaction.
     * Null when the reminder is no longer pending (someone else got there first).
     */
    async dismiss(
      itemId: string,
      v: { outcome: Exclude<ReminderOutcome, 'pending'>; by: string; resolution: string | null },
      events: readonly ItemEventInput[],
    ): Promise<ItemRow | null> {
      return await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(reminders)
          .set({
            outcome: v.outcome,
            dismissedBy: v.by,
            dismissedAt: sql`now()`,
            resolution: v.resolution,
          })
          .where(and(eq(reminders.itemId, itemId), eq(reminders.outcome, 'pending')))
          .returning({ itemId: reminders.itemId });
        if (!updated) return null;
        await tx
          .update(items)
          .set({ status: 'archived' })
          .where(and(eq(items.id, itemId), eq(items.status, 'published')));
        const [item] = await tx.select(itemColumns).from(items).where(eq(items.id, itemId));
        await insertItemEvents(tx, item!, events);
        return item!;
      });
    },
  };
  return repo;
}

export type RemindersRepo = ReturnType<typeof createRemindersRepo>;
