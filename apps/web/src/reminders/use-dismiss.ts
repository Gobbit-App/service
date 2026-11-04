import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Item } from '@gobbit/shared';
import { isApiError } from '../api/api-error';
import { api, unwrap } from '../api/client';
import type { PagesData } from '../api/favorite-cache';
import { invalidateAfterLifecycle, nextListData } from '../api/item-lifecycle';
import { queryKeys, type ItemFilter } from '../api/query-keys';
import { showToast } from '../ui/toast-store';

export type DismissInput = { done: boolean; resolution?: string };

export const DISMISS_FAILED = "Couldn't dismiss the reminder.";

/** D294 problem types, worded for the dismiss dialog. */
const DISMISS_PROBLEM_COPY: Readonly<Record<string, string>> = {
  '/problems/not-a-dismisser': "You can't dismiss this reminder.",
  '/problems/invalid-transition': 'Someone already dismissed this reminder.',
};

export function dismissErrorMessage(err: unknown): string {
  if (!isApiError(err)) return `${DISMISS_FAILED} Check your connection and try again.`;
  const copy = err.problem?.type ? DISMISS_PROBLEM_COPY[err.problem.type] : undefined;
  if (copy) return copy;
  if (err.status === 404) return 'This card is no longer available.';
  return err.problem?.detail ?? DISMISS_FAILED;
}

/** Puts the dismissed (archived) card into every cached list of its deck and its detail cache. */
export function applyDismissed(qc: QueryClient, deckSlug: string, next: Item): void {
  for (const [key, data] of qc.getQueriesData<PagesData>({
    queryKey: queryKeys.deckItemLists(deckSlug),
  })) {
    const filter = key[2] as ItemFilter | undefined;
    if (filter) qc.setQueryData(key, nextListData(filter, data, next));
  }
  qc.setQueryData(queryKeys.item(next.id), next);
}

/**
 * D294: `POST /items/{id}/dismiss`. Not optimistic: the server decides who wins when two people
 * dismiss at once, and the losing side sees why. Lists and the card refresh afterwards.
 */
export function useDismiss(item: Item, deckSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DismissInput) =>
      unwrap(
        api.POST('/items/{id}/dismiss', {
          params: { path: { id: item.id } },
          body: input,
        }),
      ),
    onSuccess: (next: Item, input) => {
      applyDismissed(qc, deckSlug, next);
      showToast({ message: input.done ? 'Reminder marked done' : 'Reminder dismissed' });
    },
    onSettled: () => invalidateAfterLifecycle(qc, { item, deckSlug }),
  });
}
