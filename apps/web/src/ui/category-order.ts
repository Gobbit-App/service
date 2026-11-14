import { defaultStore, type KeyValueStore } from '../lib/last-deck';

/**
 * D402: how this device lists a deck's categories — by name A–Z (the default), or by when they were
 * created, oldest or newest first. The default category stays first in every order.
 */
export type CategoryOrder = 'name' | 'oldest' | 'newest';

export const CATEGORY_ORDER_KEY = 'gobbit:category-order';

export const CATEGORY_ORDERS: readonly CategoryOrder[] = ['name', 'oldest', 'newest'];

/** Anything stored that isn't an explicit creation order means A–Z. */
export function parseCategoryOrder(raw: string | null | undefined): CategoryOrder {
  return raw === 'oldest' || raw === 'newest' ? raw : 'name';
}

export function readCategoryOrder(store: KeyValueStore | null = defaultStore()): CategoryOrder {
  if (store === null) return 'name';
  try {
    return parseCategoryOrder(store.getItem(CATEGORY_ORDER_KEY));
  } catch {
    return 'name';
  }
}

/** Stores an explicit choice; A–Z is the absence of one. Storage errors only cost persistence. */
export function saveCategoryOrder(
  order: CategoryOrder,
  store: KeyValueStore | null = defaultStore(),
): void {
  if (store === null) return;
  try {
    if (order === 'name') store.removeItem(CATEGORY_ORDER_KEY);
    else store.setItem(CATEGORY_ORDER_KEY, order);
  } catch {
    // Private mode or a full quota: the choice still applies for this visit.
  }
}
