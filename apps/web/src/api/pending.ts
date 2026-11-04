import { queryOptions } from '@tanstack/react-query';
import type { PendingList } from '@gobbit/shared/reminders';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** A minute: the bell's light stays roughly current while the app is open. */
const PENDING_REFETCH_MS = 60_000;

/**
 * 037 (D298): `GET /me/pending`, shared by the bell and `/notifications`. Persisted like other
 * API data, so offline the screen shows the last known list; refetched on focus (a notification
 * tap brings the app forward).
 */
export const pendingQuery = () =>
  queryOptions({
    queryKey: queryKeys.pending,
    queryFn: ({ signal }): Promise<PendingList> => unwrap(api.GET('/me/pending', { signal })),
    refetchOnWindowFocus: 'always',
    refetchInterval: PENDING_REFETCH_MS,
  });

/** What the bell shows: its light and accessible name. */
export type BellState = { light: 'none' | 'pending' | 'overdue'; label: string };

export function bellState(list: PendingList | undefined): BellState {
  const pending = list?.items.length ?? 0;
  if (pending === 0) return { light: 'none', label: 'Notifications' };
  const overdue = list!.items.filter((p) => p.overdue).length;
  return {
    light: overdue > 0 ? 'overdue' : 'pending',
    label:
      overdue > 0
        ? `Notifications, ${pending} pending, ${overdue} overdue`
        : `Notifications, ${pending} pending`,
  };
}
