import type { Item, ReviewCount, ReviewList } from '@pb/shared';

/** Drops a proposal from the queue (optimistic publish/discard, D107); untouched data keeps its identity. */
export function removeReviewEntry(
  list: ReviewList | undefined,
  itemId: string,
): ReviewList | undefined {
  if (!list) return undefined;
  const data = list.data.filter((entry) => entry.item.id !== itemId);
  if (data.length === list.data.length) return list;
  return { data, count: Math.max(0, list.count - 1) };
}

/** Decrements the pill count alongside the queue. */
export function decrementCount(count: ReviewCount | undefined): ReviewCount | undefined {
  if (!count) return undefined;
  return { count: Math.max(0, count.count - 1) };
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
