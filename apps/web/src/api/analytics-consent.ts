import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AnalyticsConsent, Me, SetAnalyticsConsent } from '@gobbit/shared';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/**
 * D260/D262: saves the member's analytics answer (`PUT /me/analytics-consent`) and writes the
 * result into the `me` cache, which the analytics facade watches — so the change applies at once,
 * with no reload. Nothing is queued offline (the caller disables the controls instead, D266).
 */
export function useSetAnalyticsConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetAnalyticsConsent): Promise<AnalyticsConsent> =>
      unwrap(api.PUT('/me/analytics-consent', { body })),
    onSuccess: (analyticsConsent) => {
      qc.setQueryData<Me>(queryKeys.me, (me) => (me ? { ...me, analyticsConsent } : me));
    },
  });
}
