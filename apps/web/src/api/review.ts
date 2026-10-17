import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Item, ItemPatch, PublishRequest, ReviewCount, ReviewList } from '@pb/shared';
import { decrementCount, removeReviewEntry, replaceReviewItem } from '../review/review-cache';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** D107: the deck's proposals; never persisted, refetched whenever the app regains focus. */
export const reviewQuery = (deckSlug: string) =>
  queryOptions({
    queryKey: queryKeys.review(deckSlug),
    queryFn: ({ signal }): Promise<ReviewList> =>
      unwrap(api.GET('/decks/{id}/review', { params: { path: { id: deckSlug } }, signal })),
    refetchOnWindowFocus: 'always',
  });

/** D107: the header pill's count. */
export const reviewCountQuery = (deckSlug: string) =>
  queryOptions({
    queryKey: queryKeys.reviewCount(deckSlug),
    queryFn: ({ signal }): Promise<ReviewCount> =>
      unwrap(api.GET('/decks/{id}/review/count', { params: { path: { id: deckSlug } }, signal })),
    refetchOnWindowFocus: 'always',
  });

export type ReviewSnapshot = { list: ReviewList | undefined; count: ReviewCount | undefined };

/** Optimistically drops a proposal from the queue and the pill count. */
export async function removeFromReview(
  qc: QueryClient,
  deckSlug: string,
  itemId: string,
): Promise<ReviewSnapshot> {
  await qc.cancelQueries({ queryKey: queryKeys.review(deckSlug) });
  const snapshot: ReviewSnapshot = {
    list: qc.getQueryData<ReviewList>(queryKeys.review(deckSlug)),
    count: qc.getQueryData<ReviewCount>(queryKeys.reviewCount(deckSlug)),
  };
  const list = removeReviewEntry(snapshot.list, itemId);
  qc.setQueryData(queryKeys.review(deckSlug), list);
  if (list !== snapshot.list) {
    qc.setQueryData(queryKeys.reviewCount(deckSlug), decrementCount(snapshot.count));
  }
  return snapshot;
}

export function restoreReview(qc: QueryClient, deckSlug: string, snapshot: ReviewSnapshot): void {
  qc.setQueryData(queryKeys.review(deckSlug), snapshot.list);
  qc.setQueryData(queryKeys.reviewCount(deckSlug), snapshot.count);
}

/** Shared optimistic lifecycle of publish and discard; settled refetches the queue and lists. */
function useReviewAction<TVars extends { itemId: string }>(
  deckSlug: string,
  send: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: (vars) => removeFromReview(qc, deckSlug, vars.itemId),
    onError: (_error, _vars, snapshot) => {
      if (snapshot) restoreReview(qc, deckSlug, snapshot);
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.review(deckSlug) }),
        qc.invalidateQueries({ queryKey: queryKeys.itemLists }),
        // Publishing may create the suggested category.
        qc.invalidateQueries({ queryKey: queryKeys.categories(deckSlug) }),
      ]),
  });
}

export type PublishVars = { itemId: string } & Partial<PublishRequest>;

/** D106: publish as new, apply as an update, optionally creating the suggested category. */
export function usePublishProposal(deckSlug: string) {
  return useReviewAction(deckSlug, ({ itemId, ...body }: PublishVars) =>
    unwrap(api.POST('/items/{id}/publish', { params: { path: { id: itemId } }, body })),
  );
}

export function useDiscardProposal(deckSlug: string) {
  return useReviewAction(deckSlug, ({ itemId }: { itemId: string }) =>
    unwrap(api.POST('/items/{id}/discard', { params: { path: { id: itemId } } })),
  );
}

/** D107 inline edit: PATCH the proposal, then swap it into the queue. */
export function useUpdateProposal(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: ItemPatch }): Promise<Item> =>
      unwrap(api.PATCH('/items/{id}', { params: { path: { id: itemId } }, body: patch })),
    onSuccess: (item) =>
      qc.setQueryData<ReviewList | undefined>(queryKeys.review(deckSlug), (list) =>
        replaceReviewItem(list, item),
      ),
  });
}
