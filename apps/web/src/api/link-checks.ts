import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Deck, Item } from '@pb/shared';
import { can } from '@pb/shared/authz';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';
import { applyUpdatedItem } from './update-item';

/** D165: what an editor can do about a link card's flag. */
export type LinkCheckAction = 'check' | 'dismiss';

/** Check again / Dismiss: only on flagged, live link cards, only for `item.update` roles. */
export function linkCheckActions(item: Item, role: Deck['role']): LinkCheckAction[] {
  if (item.type !== 'link' || item.linkHealth === null) return [];
  if (item.status !== 'published' || item.deletedAt !== undefined) return [];
  return can(role, 'item.update') ? ['check', 'dismiss'] : [];
}

/** The card as it is once its flag is dismissed. */
export function withoutFlag(item: Item): Item {
  return { ...item, linkHealth: null };
}

/** `POST /items/{id}/link-check` (10 per member per hour); answers with the re-checked card. */
export async function checkLinkNow(qc: QueryClient, deckSlug: string, item: Item): Promise<Item> {
  const next = await unwrap(
    api.POST('/items/{id}/link-check', { params: { path: { id: item.id } } }),
  );
  await applyUpdatedItem(qc, deckSlug, next);
  return next;
}

/** `DELETE /items/{id}/link-check/flag`: the flag hides until a later check changes status. */
export async function dismissLinkFlag(
  qc: QueryClient,
  deckSlug: string,
  item: Item,
): Promise<Item> {
  await unwrap(api.DELETE('/items/{id}/link-check/flag', { params: { path: { id: item.id } } }));
  const next = withoutFlag(item);
  qc.setQueryData(queryKeys.item(item.id), next);
  await qc.invalidateQueries({ queryKey: queryKeys.deckItemLists(deckSlug) });
  return next;
}

export type LinkCheckVars = { item: Item; action: LinkCheckAction };

/** Check again or Dismiss as a mutation (pending state for the buttons). */
export function useLinkCheck(deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, action }: LinkCheckVars): Promise<Item> =>
      action === 'check' ? checkLinkNow(qc, deckSlug, item) : dismissLinkFlag(qc, deckSlug, item),
  });
}
