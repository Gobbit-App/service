import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from '@tanstack/react-query';
import type { BulkPublishResult, PublishRequest, ReviewCount, ReviewList } from '@gobbit/shared';
import { deckIdFromCache, trackContent } from '../analytics/analytics';
import { decrementCount, removeReviewEntries } from '../review/review-cache';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/**
 * D107: the deck's proposals; never persisted, refetched whenever the app regains focus.
 * D191: `source` narrows it to one import's label.
 */
export const reviewQuery = (deckSlug: string, source?: string) =>
  queryOptions({
    queryKey: source ? queryKeys.reviewSource(deckSlug, source) : queryKeys.review(deckSlug),
    queryFn: ({ signal }): Promise<ReviewList> =>
      unwrap(
        api.GET('/decks/{id}/review', {
          params: { path: { id: deckSlug }, query: source ? { source } : {} },
          signal,
        }),
      ),
    refetchOnWindowFocus: 'always',
  });

/** Every cached queue of the deck (whole and per source), not the pill count. */
export const reviewListsFilter = (deckSlug: string): QueryFilters => ({
  queryKey: queryKeys.review(deckSlug),
  predicate: (query) => query.queryKey[2] !== 'count',
});

/** D107: the header pill's count. */
export const reviewCountQuery = (deckSlug: string) =>
  queryOptions({
    queryKey: queryKeys.reviewCount(deckSlug),
    queryFn: ({ signal }): Promise<ReviewCount> =>
      unwrap(api.GET('/decks/{id}/review/count', { params: { path: { id: deckSlug } }, signal })),
    refetchOnWindowFocus: 'always',
  });

export type ReviewSnapshot = {
  lists: [QueryKey, ReviewList | undefined][];
  count: ReviewCount | undefined;
};

/** Drops proposals from every cached queue of the deck and the pill count (D107, D191). */
export async function removeFromReview(
  qc: QueryClient,
  deckSlug: string,
  itemIds: readonly string[],
): Promise<ReviewSnapshot> {
  await qc.cancelQueries({ queryKey: queryKeys.review(deckSlug) });
  const snapshot: ReviewSnapshot = {
    lists: qc.getQueriesData<ReviewList>(reviewListsFilter(deckSlug)),
    count: qc.getQueryData<ReviewCount>(queryKeys.reviewCount(deckSlug)),
  };
  let removed = 0;
  for (const [key, list] of snapshot.lists) {
    const next = removeReviewEntries(list, itemIds);
    if (list && next) removed = Math.max(removed, list.data.length - next.data.length);
    qc.setQueryData(key, next);
  }
  if (removed > 0) {
    qc.setQueryData(queryKeys.reviewCount(deckSlug), decrementCount(snapshot.count, removed));
  }
  return snapshot;
}

export function restoreReview(qc: QueryClient, deckSlug: string, snapshot: ReviewSnapshot): void {
  for (const [key, list] of snapshot.lists) qc.setQueryData(key, list);
  qc.setQueryData(queryKeys.reviewCount(deckSlug), snapshot.count);
}

/** Refetches the queues and lists after a review action (publishing may create a category). */
function refreshAfterReview(qc: QueryClient, deckSlug: string): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.review(deckSlug) }),
    qc.invalidateQueries({ queryKey: queryKeys.itemLists }),
    qc.invalidateQueries({ queryKey: queryKeys.categories(deckSlug) }),
  ]);
}

/** Shared optimistic lifecycle of publish and discard; settled refetches the queue and lists. */
function useReviewAction<TVars extends { itemId: string }, TResult>(
  deckSlug: string,
  send: (vars: TVars) => Promise<TResult>,
  onSent?: (result: TResult, vars: TVars) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: onSent,
    onMutate: (vars) => removeFromReview(qc, deckSlug, [vars.itemId]),
    onError: (_error, _vars, snapshot) => {
      if (snapshot) restoreReview(qc, deckSlug, snapshot);
    },
    onSettled: () => refreshAfterReview(qc, deckSlug),
  });
}

export type PublishVars = { itemId: string } & Partial<PublishRequest>;

/** D106: publish as new, apply as an update, optionally creating the suggested category. */
export function usePublishProposal(deckSlug: string) {
  return useReviewAction(
    deckSlug,
    ({ itemId, ...body }: PublishVars) =>
      unwrap(api.POST('/items/{id}/publish', { params: { path: { id: itemId } }, body })),
    (item, { mode }) =>
      // D248: publishing as new creates a card; applying a proposal as an update edits one.
      trackContent(mode === 'update' ? 'card-edited' : 'card-created', {
        deckId: item.deckId,
        itemId: item.id,
        type: item.type,
        channel: 'review',
      }),
  );
}

export function useDiscardProposal(deckSlug: string) {
  return useReviewAction(deckSlug, ({ itemId }: { itemId: string }) =>
    unwrap(api.POST('/items/{id}/discard', { params: { path: { id: itemId } } })),
  );
}

/**
 * D191: publishes up to `BULK_PUBLISH_MAX` selected proposals as new. Not optimistic: skipped
 * ones stay, so only the published ids leave the queues once the server answers.
 */
export function useBulkPublish(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]): Promise<BulkPublishResult> =>
      unwrap(
        api.POST('/decks/{id}/review/publish', {
          params: { path: { id: deckSlug } },
          body: { ids: [...ids] },
        }),
      ),
    onSuccess: (result) => {
      if (result.published.length > 0) {
        trackContent('card-created', {
          deckId: deckIdFromCache(qc, deckSlug),
          count: result.published.length,
          channel: 'bulk-publish',
        });
      }
      return removeFromReview(qc, deckSlug, result.published);
    },
    onSettled: () => refreshAfterReview(qc, deckSlug),
  });
}
