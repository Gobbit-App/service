import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemCreateInput } from '@pb/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** Creates a card in a deck; every item list refetches on success (Phase 3B editor). */
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.itemLists }),
  });
}
