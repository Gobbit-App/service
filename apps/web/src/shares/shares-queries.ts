import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShareList, ShareSummary } from '@gobbit/shared';
import { SHARE_POLL_MS } from '@gobbit/shared/ingest-constants';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/query-keys';
import { anyProcessing } from './share-state';

/**
 * D198: the caller's shares on the deck, newest first. Polls every `SHARE_POLL_MS` while a row
 * is processing and stops once nothing is; persisted like other deck queries (FR-016).
 */
export const sharesQuery = (deckSlug: string) =>
  queryOptions({
    queryKey: queryKeys.shares(deckSlug),
    queryFn: ({ signal }): Promise<ShareList> =>
      unwrap(api.GET('/decks/{id}/shares', { params: { path: { id: deckSlug } }, signal })),
    refetchInterval: (query) => (anyProcessing(query.state.data?.shares) ? SHARE_POLL_MS : false),
    refetchOnWindowFocus: 'always',
  });

/** D198: one share; the Sent screen polls it until it leaves `processing`. */
export const shareQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.share(id),
    queryFn: ({ signal }): Promise<ShareSummary> =>
      unwrap(api.GET('/shares/{id}', { params: { path: { id } }, signal })),
    refetchInterval: (query) => (query.state.data?.state === 'processing' ? SHARE_POLL_MS : false),
  });

/** Swaps the retried share into the cached list so the row turns to "Processing…" at once. */
function replaceShare(list: ShareList | undefined, next: ShareSummary): ShareList | undefined {
  if (!list) return list;
  return { shares: list.shares.map((s) => (s.id === next.id ? next : s)) };
}

/** D197: "Try again" on a failed share; the list refetches either way (polling resumes). */
export function useRetryShare(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<ShareSummary> =>
      unwrap(api.POST('/shares/{id}/retry', { params: { path: { id } } })),
    onSuccess: (share) => {
      qc.setQueryData<ShareList>(queryKeys.shares(deckSlug), (list) => replaceShare(list, share));
      qc.setQueryData(queryKeys.share(share.id), share);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.shares(deckSlug) }),
  });
}
