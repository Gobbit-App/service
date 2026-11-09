import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Item } from '@gobbit/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** D364: Mute/Unmute shows on live events that would notify the caller. */
export function canMuteEvent(item: Item): boolean {
  return (
    item.type === 'event' &&
    item.status === 'published' &&
    item.deletedAt === undefined &&
    item.event?.inAudience === true
  );
}

/** The card as it is once the caller's mute changed. */
export function withMute(item: Item, muted: boolean): Item {
  return item.event ? { ...item, event: { ...item.event, muted } } : item;
}

/**
 * `PUT`/`DELETE /items/{id}/mute` (204, idempotent). Updates the cached card and refreshes the
 * deck lists and the Coming up list, which leaves out muted events.
 */
export async function setEventMute(
  qc: QueryClient,
  deckSlug: string,
  item: Item,
  muted: boolean,
): Promise<Item> {
  const params = { params: { path: { id: item.id } } };
  await unwrap(
    muted ? api.PUT('/items/{id}/mute', params) : api.DELETE('/items/{id}/mute', params),
  );
  const next = withMute(item, muted);
  qc.setQueryData(queryKeys.item(item.id), next);
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.deckItemLists(deckSlug) }),
    qc.invalidateQueries({ queryKey: queryKeys.pending }),
  ]);
  return next;
}

export type EventMuteVars = { item: Item; muted: boolean };

export function useEventMute(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, muted }: EventMuteVars): Promise<Item> =>
      setEventMute(qc, deckSlug, item, muted),
  });
}
