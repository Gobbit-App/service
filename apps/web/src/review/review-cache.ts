import type { Item, ReviewCount, ReviewList } from '@pb/shared';

/** Drops a proposal from the queue (optimistic publish/discard, D107); untouched data keeps its identity. */
export function removeReviewEntry(
  list: ReviewList | undefined,
  itemId: string,
): ReviewList | undefined {
  return removeReviewEntries(list, [itemId]);
}

/** Drops several proposals (bulk publish, D191); untouched data keeps its identity. */
export function removeReviewEntries(
  list: ReviewList | undefined,
  itemIds: readonly string[],
): ReviewList | undefined {
  if (!list) return undefined;
  const ids = new Set(itemIds);
  const data = list.data.filter((entry) => !ids.has(entry.item.id));
  const removed = list.data.length - data.length;
  if (removed === 0) return list;
  return { data, count: Math.max(0, list.count - removed) };
}

/** Decrements the pill count alongside the queue. */
export function decrementCount(count: ReviewCount | undefined, by = 1): ReviewCount | undefined {
  if (!count) return undefined;
  return { count: Math.max(0, count.count - by) };
}

/** Swaps in the proposal returned by an inline edit (PATCH), keeping its job and target. */
export function replaceReviewItem(
  list: ReviewList | undefined,
  item: Item,
): ReviewList | undefined {
  if (!list) return undefined;
  let changed = false;
  const data = list.data.map((entry) => {
    if (entry.item.id !== item.id) return entry;
    changed = true;
    return { ...entry, item };
  });
  return changed ? { ...list, data } : list;
}
