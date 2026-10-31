import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Item, ItemPatch, ReviewList } from '@gobbit/shared';
import { trackContent } from '../analytics/analytics';
import { replaceReviewItem } from '../review/review-cache';
import { api, unwrap } from './client';
import { reviewListsFilter } from './review';
import { queryKeys, REVIEW_KEY, SEARCH_KEY } from './query-keys';

export type UpdateItemVars = { itemId: string; patch: ItemPatch };

/** R9: the card view gets the response; lists, search and (for proposals) the queue refetch. */
export async function applyUpdatedItem(
  qc: QueryClient,
  deckSlug: string,
  item: Item,
): Promise<void> {
  qc.setQueryData(queryKeys.item(item.id), item);
  if (item.status === 'proposed') {
    qc.setQueriesData<ReviewList | undefined>(reviewListsFilter(deckSlug), (list) =>
      replaceReviewItem(list, item),
    );
  }
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.itemLists }),
    qc.invalidateQueries({ queryKey: [SEARCH_KEY] }),
    item.status === 'proposed'
      ? qc.invalidateQueries({ queryKey: [REVIEW_KEY] })
      : Promise.resolve(),
  ]);
}

/** PATCH `/items/{id}` with a minimal patch (D137); used by the editor and the review inline edit. */
export function useUpdateItem(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, patch }: UpdateItemVars): Promise<Item> =>
      unwrap(api.PATCH('/items/{id}', { params: { path: { id: itemId } }, body: patch })),
    onSuccess: (item) => {
      // D248: editing a proposal is review work, not a card edit; publishing counts instead.
      if (item.status !== 'proposed') {
        trackContent('card-edited', {
          deckId: item.deckId,
          itemId: item.id,
          type: item.type,
          channel: 'editor',
        });
      }
      return applyUpdatedItem(qc, deckSlug, item);
    },
  });
}
