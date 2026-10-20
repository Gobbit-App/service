import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemCreateInput } from '@pb/shared';
import { api, unwrap } from './client';
import { queryKeys, SEARCH_KEY } from './query-keys';

/** Creates a card in a deck; every item list and search refetch on success (R9). */
export function useCreateItem(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemCreateInput) =>
      unwrap(
        api.POST('/decks/{id}/items', {
          params: { path: { id: deckSlug } },
          body: input,
        }),
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.itemLists }),
        qc.invalidateQueries({ queryKey: [SEARCH_KEY] }),
      ]),
  });
}
