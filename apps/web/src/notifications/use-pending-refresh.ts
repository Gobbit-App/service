import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../api/query-keys';
import { PENDING_CHANGED } from '../push/sw-push';

/**
 * 037 (FR-024): refetches the pending list when the service worker reports a reminder push while
 * the app is open, so the bell and /notifications don't wait for focus or the minute refetch.
 */
export function usePendingRefresh(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
    if (!worker) return;
    const onMessage = (event: MessageEvent): void => {
      if ((event.data as { type?: unknown } | null)?.type !== PENDING_CHANGED) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.pending });
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, [queryClient]);
}
