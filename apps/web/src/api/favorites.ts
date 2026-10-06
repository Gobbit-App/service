import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import { api, unwrap } from './client';
import {
  removeFromPages,
  setFavoriteInPages,
  setFavoriteOnItem,
  type PagesData,
} from './favorite-cache';
import { isFavoritesListKey, queryKeys } from './query-keys';

export type FavoriteChange = { itemId: string; isFavorite: boolean };

/** Everything the optimistic update touched, restored as-is on failure. */
export type FavoriteSnapshot = {
  lists: [QueryKey, PagesData | undefined][];
  item: Item | undefined;
};

/** Optimistically flips the flag in every list and the detail view (P3.5). */
export async function applyFavorite(
  qc: QueryClient,
  { itemId, isFavorite }: FavoriteChange,
): Promise<FavoriteSnapshot> {
  await Promise.all([
    qc.cancelQueries({ queryKey: queryKeys.itemLists }),
    qc.cancelQueries({ queryKey: queryKeys.item(itemId) }),
  ]);

  const snapshot: FavoriteSnapshot = {
    lists: qc.getQueriesData<PagesData>({ queryKey: queryKeys.itemLists }),
    item: qc.getQueryData<Item>(queryKeys.item(itemId)),
  };

  for (const [key, data] of snapshot.lists) {
    const next =
      !isFavorite && isFavoritesListKey(key)
        ? removeFromPages(data, itemId)
        : setFavoriteInPages(data, itemId, isFavorite);
    qc.setQueryData(key, next);
  }
  qc.setQueryData(queryKeys.item(itemId), setFavoriteOnItem(snapshot.item, itemId, isFavorite));

  return snapshot;
}

export function rollbackFavorite(
  qc: QueryClient,
  itemId: string,
  snapshot: FavoriteSnapshot,
): void {
  for (const [key, data] of snapshot.lists) qc.setQueryData(key, data);
  qc.setQueryData(queryKeys.item(itemId), snapshot.item);
}

function sendFavorite({ itemId, isFavorite }: FavoriteChange): Promise<unknown> {
  const params = { params: { path: { id: itemId } } };
  return unwrap(
    isFavorite
      ? api.POST('/items/{id}/favorite', params)
      : api.DELETE('/items/{id}/favorite', params),
  );
}

/** Favorite toggle with optimistic update and rollback (P3.5). */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendFavorite,
    onMutate: (change) => applyFavorite(qc, change),
    onError: (_error, change, snapshot) => {
      if (snapshot) rollbackFavorite(qc, change.itemId, snapshot);
    },
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: queryKeys.itemLists,
        predicate: (query) => isFavoritesListKey(query.queryKey),
      }),
  });
}
