import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdminWaitlistInviteResult,
  AdminWaitlistPage,
  WaitlistKind,
  WaitlistStatus,
} from '@gobbit/shared';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/query-keys';

/** 032: `GET /admin/waitlist`, one status (and optionally one kind) at a time; never persisted. */
export const adminWaitlistQuery = (status: WaitlistStatus, kind: WaitlistKind | null) =>
  infiniteQueryOptions({
    queryKey: queryKeys.adminWaitlist(status, kind),
    queryFn: ({ pageParam, signal }): Promise<AdminWaitlistPage> =>
      unwrap(
        api.GET('/admin/waitlist', {
          params: {
            query: {
              status,
              ...(kind ? { kind } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
          signal,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchOnWindowFocus: 'always',
  });

/** Invite a confirmed entry, or resend the link of an invited one. */
export function useInviteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<AdminWaitlistInviteResult> =>
      unwrap(api.POST('/admin/waitlist/{id}/invite', { params: { path: { id } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.adminWaitlistAll }),
  });
}

/** Remove a pending or confirmed entry (invited ones can't be removed). */
export function useRemoveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      unwrap(api.DELETE('/admin/waitlist/{id}', { params: { path: { id } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.adminWaitlistAll }),
  });
}
