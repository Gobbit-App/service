import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeckWithCategories } from '@gobbit/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/**
 * D269: `POST /decks` from the deck list. Always a `shared` deck: the API's default kind is
 * `personal`, and only the sign-in step creates those. The deck list refetches either way.
 */
export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string): Promise<DeckWithCategories> =>
      unwrap(api.POST('/decks', { body: { name: name.trim(), kind: 'shared' } })),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.decks }),
  });
}
