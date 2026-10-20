import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import { api, unwrap } from './client';
import { insertIntoPages, removeFromPages, type PagesData } from './favorite-cache';
import { queryKeys, SEARCH_KEY, type ItemFilter } from './query-keys';

/** The four lifecycle transitions (D131, D132); the server owns the rules. */
export type LifecycleAction = 'archive' | 'restore' | 'delete' | 'undelete';

export type LifecycleChange = { item: Item; deckSlug: string; action: LifecycleAction };

/** Everything the optimistic update touched, restored as-is on failure. */
export type LifecycleSnapshot = {
  lists: [QueryKey, PagesData | undefined][];
  item: Item | undefined;
};

/** The action each one undoes (the toast's Undo, D146). */
export const INVERSE: Record<LifecycleAction, LifecycleAction> = {
  archive: 'restore',
  restore: 'archive',
  delete: 'undelete',
  undelete: 'delete',
};

/** The card as the server will return it, so lists update before the response arrives. */
export function expectedItem(item: Item, action: LifecycleAction, now: Date = new Date()): Item {
  switch (action) {
    case 'archive':
      return { ...item, status: 'archived' };
    case 'restore':
      return { ...item, status: 'published' };
    case 'delete':
      return { ...item, deletedAt: now.toISOString() };
    case 'undelete': {
      const { deletedAt: _deletedAt, ...live } = item;
      return live;
    }
  }
}

/**
 * Whether a list shows `item`: `true`/`false` when the filter decides it, `null` when the
 * client can't tell (category lists know a slug, the card only ids) and the refetch settles it.
 */
export function belongsTo(filter: ItemFilter, item: Item): boolean | null {
  const deleted = item.deletedAt !== undefined;
  switch (filter.kind) {
    case 'deleted':
      return deleted && item.status !== 'proposed';
    case 'archived':
      return !deleted && item.status === 'archived';
    case 'all':
      return !deleted && item.status === 'published';
    case 'favorites':
      return !deleted && item.status === 'published' && item.isFavorite;
    case 'category':
      return !deleted && item.status === 'published' ? null : false;
  }
}

/** API order: newest first, `(createdAt, id)` for live lists, `(deletedAt, id)` for deleted. */
function rankFor(filter: ItemFilter): (item: Item) => string {
  return filter.kind === 'deleted'
    ? (item) => `${item.deletedAt ?? ''}|${item.id}`
    : (item) => `${item.createdAt}|${item.id}`;
}

function listedIn(data: PagesData | undefined, itemId: string): boolean {
  return data?.pages.some((page) => page.data.some((i) => i.id === itemId)) ?? false;
}

/** Applies `next` to one cached list: remove, insert in order, replace, or leave alone. */
export function nextListData(
  filter: ItemFilter,
  data: PagesData | undefined,
  next: Item,
): PagesData | undefined {
  const shows = belongsTo(filter, next);
  if (shows === false) return removeFromPages(data, next.id);
  if (shows === true || listedIn(data, next.id)) {
    return insertIntoPages(data, next, rankFor(filter));
  }
  return data;
}

/** D146: optimistic update of the deck's lists and the card's detail cache. */
export async function applyLifecycle(
  qc: QueryClient,
  { item, deckSlug, action }: LifecycleChange,
): Promise<LifecycleSnapshot> {
  const listsKey = queryKeys.deckItemLists(deckSlug);
  await Promise.all([
    qc.cancelQueries({ queryKey: listsKey }),
    qc.cancelQueries({ queryKey: queryKeys.item(item.id) }),
  ]);

  const snapshot: LifecycleSnapshot = {
    lists: qc.getQueriesData<PagesData>({ queryKey: listsKey }),
    item: qc.getQueryData<Item>(queryKeys.item(item.id)),
  };

  const next = expectedItem(item, action);
  for (const [key, data] of snapshot.lists) {
    const filter = key[2] as ItemFilter | undefined;
    if (filter) qc.setQueryData(key, nextListData(filter, data, next));
  }
  if (snapshot.item) qc.setQueryData(queryKeys.item(item.id), next);

  return snapshot;
}

export function rollbackLifecycle(
  qc: QueryClient,
  itemId: string,
  snapshot: LifecycleSnapshot,
): void {
  for (const [key, data] of snapshot.lists) qc.setQueryData(key, data);
  qc.setQueryData(queryKeys.item(itemId), snapshot.item);
}

/** Search results (never persisted, D79), the deck's lists and the card are refetched. */
export function invalidateAfterLifecycle(
  qc: QueryClient,
  { item, deckSlug }: Pick<LifecycleChange, 'item' | 'deckSlug'>,
): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: [SEARCH_KEY] }),
    qc.invalidateQueries({ queryKey: queryKeys.deckItemLists(deckSlug) }),
    qc.invalidateQueries({ queryKey: queryKeys.item(item.id) }),
  ]);
}

/** One request per action; DELETE has no body, the others return the card. */
export async function sendLifecycle({ item, action }: LifecycleChange): Promise<void> {
  const params = { params: { path: { id: item.id } } };
  switch (action) {
    case 'archive':
      await unwrap(api.POST('/items/{id}/archive', params));
      return;
    case 'restore':
      await unwrap(api.POST('/items/{id}/restore', params));
      return;
    case 'delete':
      await unwrap(api.DELETE('/items/{id}', params));
      return;
    case 'undelete':
      await unwrap(api.POST('/items/{id}/undelete', params));
      return;
  }
}

/**
 * D146: optimistic update → request → rollback on failure → refetch. Imperative (not tied
 * to a component) so the toast's Undo still works after the card view has unmounted.
 * Rethrows the request error for the caller's message.
 */
export async function runLifecycle(qc: QueryClient, change: LifecycleChange): Promise<void> {
  const snapshot = await applyLifecycle(qc, change);
  try {
    await sendLifecycle(change);
  } catch (error) {
    rollbackLifecycle(qc, change.item.id, snapshot);
    throw error;
  } finally {
    void invalidateAfterLifecycle(qc, change);
  }
}

/** Archive, restore, delete or undelete as a mutation (pending state for the buttons). */
export function useLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: LifecycleChange) => runLifecycle(qc, change),
  });
}
