import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';
import { runSeed, seedId } from '../seed/run-seed';
import {
  accounts,
  users,
  decks,
  categories,
  items,
  itemCategories,
  favorites,
} from '../src/schema';
import { eq, sql } from 'drizzle-orm';

describe('seed', () => {
  const t = withTestDb();

  it('should seed database with correct row counts', async () => {
    // Run seed
    const result = await runSeed(t.pool);
    expect(result.items).toBe(25);

    // Count rows in each table
    const [accountsRow] = await t.db.select({ count: sql<number>`count(*)::int` }).from(accounts);
    const [usersRow] = await t.db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [decksRow] = await t.db.select({ count: sql<number>`count(*)::int` }).from(decks);
    await t.db.select({ count: sql<number>`count(*)::int` }).from(categories);
    const [itemsRow] = await t.db.select({ count: sql<number>`count(*)::int` }).from(items);
    const [itemCategoriesRow] = await t.db
      .select({ count: sql<number>`count(*)::int` })
      .from(itemCategories);
    const [favoritesRow] = await t.db.select({ count: sql<number>`count(*)::int` }).from(favorites);

    expect(accountsRow.count).toBe(2);
    expect(usersRow.count).toBe(2);
    expect(decksRow.count).toBe(4);
    expect(itemsRow.count).toBe(25);
    expect(itemCategoriesRow.count).toBeGreaterThanOrEqual(25);
    expect(favoritesRow.count).toBe(1);

    // Count categories in family deck
    const familyId = seedId('deck/family');
    const [familyCatRow] = await t.db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.deckId, familyId));
    expect(familyCatRow.count).toBe(7);
  });

  it('should be idempotent', async () => {
    const getStats = async () => {
      const [accStats] = await t.db
        .select({ maxUpdatedAt: sql<Date>`max(updated_at)` })
        .from(accounts);
      const [usrStats] = await t.db
        .select({ maxUpdatedAt: sql<Date>`max(updated_at)` })
        .from(users);
      const [pbStats] = await t.db.select({ maxUpdatedAt: sql<Date>`max(updated_at)` }).from(decks);
      const [catStats] = await t.db
        .select({ maxUpdatedAt: sql<Date>`max(updated_at)` })
        .from(categories);
      const [itmStats] = await t.db
        .select({ maxUpdatedAt: sql<Date>`max(updated_at)` })
        .from(items);

      const [accCount] = await t.db.select({ count: sql<number>`count(*)::int` }).from(accounts);
      const [usrCount] = await t.db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [pbCount] = await t.db.select({ count: sql<number>`count(*)::int` }).from(decks);
      const [catCount] = await t.db.select({ count: sql<number>`count(*)::int` }).from(categories);
      const [itmCount] = await t.db.select({ count: sql<number>`count(*)::int` }).from(items);

      return {
        accountsMaxUpdatedAt: accStats.maxUpdatedAt,
        usersMaxUpdatedAt: usrStats.maxUpdatedAt,
        decksMaxUpdatedAt: pbStats.maxUpdatedAt,
        categoriesMaxUpdatedAt: catStats.maxUpdatedAt,
        itemsMaxUpdatedAt: itmStats.maxUpdatedAt,
        accountsCount: accCount.count,
        usersCount: usrCount.count,
        decksCount: pbCount.count,
        categoriesCount: catCount.count,
        itemsCount: itmCount.count,
      };
    };

    const statsBefore = await getStats();

    // Wait 20 ms
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Run seed again
    const result = await runSeed(t.pool);
    expect(result.items).toBe(25);

    const statsAfter = await getStats();

    // Verify counts identical
    expect(statsAfter.accountsCount).toBe(statsBefore.accountsCount);
    expect(statsAfter.usersCount).toBe(statsBefore.usersCount);
    expect(statsAfter.decksCount).toBe(statsBefore.decksCount);
    expect(statsAfter.categoriesCount).toBe(statsBefore.categoriesCount);
    expect(statsAfter.itemsCount).toBe(statsBefore.itemsCount);

    // Verify max(updated_at) identical
    expect(statsAfter.accountsMaxUpdatedAt).toEqual(statsBefore.accountsMaxUpdatedAt);
    expect(statsAfter.usersMaxUpdatedAt).toEqual(statsBefore.usersMaxUpdatedAt);
    expect(statsAfter.decksMaxUpdatedAt).toEqual(statsBefore.decksMaxUpdatedAt);
    expect(statsAfter.categoriesMaxUpdatedAt).toEqual(statsBefore.categoriesMaxUpdatedAt);
    expect(statsAfter.itemsMaxUpdatedAt).toEqual(statsBefore.itemsMaxUpdatedAt);
  });

  it('should restore modified items and update their updated_at', async () => {
    // Get an item
    const [itemToModify] = await t.db.select().from(items).limit(1);
    const originalTitle = itemToModify.title;

    // Capture initial state
    const initialState = await t.db
      .select({ id: items.id, title: items.title, updatedAt: items.updatedAt })
      .from(items);

    // Modify the item
    const newTitle = 'Modified Title';
    await t.db.update(items).set({ title: newTitle }).where(eq(items.id, itemToModify.id));

    // Verify modification
    const [modifiedItem] = await t.db.select().from(items).where(eq(items.id, itemToModify.id));
    expect(modifiedItem.title).toBe(newTitle);
    const modifiedUpdatedAt = modifiedItem.updatedAt;

    // Wait
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Run seed
    await runSeed(t.pool);

    // Verify restoration
    const [restoredItem] = await t.db.select().from(items).where(eq(items.id, itemToModify.id));
    expect(restoredItem.title).toBe(originalTitle);
    expect(restoredItem.updatedAt.getTime()).toBeGreaterThan(modifiedUpdatedAt.getTime());

    // Verify other items unchanged
    const finalState = await t.db
      .select({ id: items.id, title: items.title, updatedAt: items.updatedAt })
      .from(items);

    for (const finalItem of finalState) {
      if (finalItem.id !== itemToModify.id) {
        const initialItem = initialState.find((i) => i.id === finalItem.id)!;
        expect(finalItem.title).toBe(initialItem.title);
        expect(finalItem.updatedAt).toEqual(initialItem.updatedAt);
      }
    }
  });
});
