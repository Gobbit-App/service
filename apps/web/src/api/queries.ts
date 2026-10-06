import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { AppConfig, Category, Deck, Item, ItemPage, Me } from '@pb/shared';
import { api, unwrap } from './client';
import { itemListQuery, queryKeys, type ItemFilter } from './query-keys';

export const meQuery = () =>
  queryOptions({
    queryKey: queryKeys.me,
    queryFn: ({ signal }): Promise<Me> => unwrap(api.GET('/me', { signal })),
  });

/** D55: read once and kept in the persisted cache so images work offline. */
export const configQuery = () =>
  queryOptions({
    queryKey: queryKeys.config,
    queryFn: ({ signal }): Promise<AppConfig> => unwrap(api.GET('/config', { signal })),
    staleTime: 5 * 60_000,
  });

export const decksQuery = () =>
  queryOptions({
    queryKey: queryKeys.decks,
    queryFn: async ({ signal }): Promise<Deck[]> =>
      (await unwrap(api.GET('/decks', { signal }))).data,
  });

/** `GET /decks/{id}` resolves an id or a slug. */
export const deckQuery = (idOrSlug: string) =>
  queryOptions({
    queryKey: queryKeys.deck(idOrSlug),
    queryFn: ({ signal }): Promise<Deck> =>
      unwrap(api.GET('/decks/{id}', { params: { path: { id: idOrSlug } }, signal })),
  });

export const categoriesQuery = (idOrSlug: string) =>
  queryOptions({
    queryKey: queryKeys.categories(idOrSlug),
    queryFn: async ({ signal }): Promise<Category[]> =>
      (
        await unwrap(
          api.GET('/decks/{id}/categories', { params: { path: { id: idOrSlug } }, signal }),
        )
      ).data,
  });

export const itemsQuery = (deckSlug: string, filter: ItemFilter) =>
  infiniteQueryOptions({
    queryKey: queryKeys.items(deckSlug, filter),
    queryFn: ({ pageParam, signal }): Promise<ItemPage> =>
      unwrap(
        api.GET('/decks/{id}/items', {
          params: { path: { id: deckSlug }, query: itemListQuery(filter, pageParam) },
          signal,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export const itemQuery = (itemId: string) =>
  queryOptions({
    queryKey: queryKeys.item(itemId),
    queryFn: ({ signal }): Promise<Item> =>
      unwrap(api.GET('/items/{id}', { params: { path: { id: itemId } }, signal })),
  });
