import { infiniteQueryOptions } from '@tanstack/react-query';
import type { ItemEventPage } from '@gobbit/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** D188: the deck's activity log (or one card's history); never persisted, like the review queue. */
export const eventsQuery = (deckSlug: string, itemId?: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.events(deckSlug, itemId ?? null),
    queryFn: ({ pageParam, signal }): Promise<ItemEventPage> =>
      unwrap(
        api.GET('/decks/{id}/events', {
          params: {
            path: { id: deckSlug },
            query: {
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(itemId ? { itemId } : {}),
            },
          },
          signal,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchOnWindowFocus: 'always',
  });
