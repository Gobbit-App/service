import { z } from 'zod';

/** D297: longest push endpoint we store (push services issue a few hundred characters). */
export const PUSH_ENDPOINT_MAX = 2048;
/** D297: the subscription keys are short base64url strings (65-byte point, 16-byte secret). */
export const PUSH_KEY_MAX = 256;
/** D297: device label shown in Settings ("Chrome on Android"). */
export const PUSH_LABEL_MAX = 60;

const base64url = /^[A-Za-z0-9_-]+=*$/;

/** D297: what the browser's `PushSubscription.toJSON()` gives, plus an optional label. */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(PUSH_ENDPOINT_MAX),
  keys: z.object({
    p256dh: z.string().min(1).max(PUSH_KEY_MAX).regex(base64url),
    auth: z.string().min(1).max(PUSH_KEY_MAX).regex(base64url),
  }),
  label: z.string().trim().min(1).max(PUSH_LABEL_MAX).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** D297: turning push off on a device names its endpoint. */
export const removePushSubscriptionSchema = z.object({
  endpoint: z.string().min(1).max(PUSH_ENDPOINT_MAX),
});
export type RemovePushSubscription = z.infer<typeof removePushSubscriptionSchema>;

/** D297: how many of the caller's devices a test notification went to. */
export const pushTestResultSchema = z.object({ devices: z.number().int().nonnegative() });
export type PushTestResult = z.infer<typeof pushTestResultSchema>;

/** D297: the member's notification choices (`users.reminder_emails`). */
export const notificationPreferencesSchema = z.object({ reminderEmails: z.boolean() });
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** D296: what the service worker receives in a push message. */
export const pushMessageSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string(),
  tag: z.string(),
});
export type PushMessage = z.infer<typeof pushMessageSchema>;
