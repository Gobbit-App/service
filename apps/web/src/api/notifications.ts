import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationPreferences,
  PushSubscriptionInput,
  PushTestResult,
} from '@gobbit/shared/reminders';
import { api, unwrap } from './client';
import { queryKeys } from './query-keys';

/** 037 (D297): `GET /me/notification-preferences`. */
export const notificationPreferencesQuery = () =>
  queryOptions({
    queryKey: queryKeys.notificationPreferences,
    queryFn: ({ signal }): Promise<NotificationPreferences> =>
      unwrap(api.GET('/me/notification-preferences', { signal })),
  });

/** 037 (D297): saves the email switch and writes the answer into the cache. Nothing queues offline. */
export function useSetNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPreferences): Promise<NotificationPreferences> =>
      unwrap(api.PUT('/me/notification-preferences', { body })),
    onSuccess: (prefs) => qc.setQueryData(queryKeys.notificationPreferences, prefs),
  });
}

/** D297: registers (or refreshes) this device's push subscription. */
export const savePushSubscription = (body: PushSubscriptionInput): Promise<unknown> =>
  unwrap(api.POST('/me/push-subscriptions', { body }));

/** D297: forgets this device; idempotent on the server. */
export const removePushSubscription = (endpoint: string): Promise<unknown> =>
  unwrap(api.DELETE('/me/push-subscriptions', { body: { endpoint } }));

/** D297: sends a test notification to every device of the caller. */
export const sendTestPush = (): Promise<PushTestResult> =>
  unwrap(api.POST('/me/push-subscriptions/test'));
