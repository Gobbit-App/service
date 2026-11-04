/**
 * 037 reminder constants (D299). API, worker and web read these, never literals; web imports them
 * from the `@gobbit/shared/reminders` subpath (bundle budget). Env values may only lower the caps.
 */

export const showBeforeUnits = ['minutes', 'hours', 'days'] as const;
export type ShowBeforeUnit = (typeof showBeforeUnits)[number];

export const dismissModes = ['me', 'writers', 'people'] as const;
export type DismissMode = (typeof dismissModes)[number];

/** D294: where a reminder stands; `pending` until someone dismisses it. */
export const reminderOutcomes = ['pending', 'done', 'dismissed'] as const;
export type ReminderOutcome = (typeof reminderOutcomes)[number];

export const UNIT_MS: Readonly<Record<ShowBeforeUnit, number>> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** FR-003: show the card this long before the deadline unless the writer picks otherwise. */
export const SHOW_BEFORE_DEFAULT = { amount: 24, unit: 'hours' } as const;

/** D299: the longest show-before period (env `REMINDER_MAX_SHOW_BEFORE_DAYS` may lower it). */
export const REMINDER_MAX_SHOW_BEFORE_DAYS = 365;

/** D299: the furthest deadline from now (env `REMINDER_MAX_DEADLINE_DAYS` may lower it). */
export const REMINDER_MAX_DEADLINE_DAYS = 1826;

/** D299: resolution length in Unicode code points (env `REMINDER_RESOLUTION_MAX` may lower it). */
export const REMINDER_RESOLUTION_MAX = 600;

/** D293: most people a "specific people" rule may list. */
export const REMINDER_PEOPLE_MAX = 50;

/** D295: delivery attempts and backoff base (env `NOTIFY_MAX_ATTEMPTS`, `NOTIFY_RETRY_BASE_SECONDS`). */
export const NOTIFY_MAX_ATTEMPTS = 5;
export const NOTIFY_RETRY_BASE_SECONDS = 60;

/** D295: due reminders claimed per sweep tick (env `REMINDER_SWEEP_BATCH`). */
export const REMINDER_SWEEP_BATCH = 200;

/** D295: the sweep runs every minute. */
export const REMINDER_SWEEP_CRON = '* * * * *';

/** D297: test notifications per user per hour. */
export const PUSH_TEST_PER_HOUR = 5;

/** D295: how a reminder reaches a person. */
export const notificationChannels = ['email', 'push'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

/**
 * D295: one delivery's state. `sending` = claimed; `interrupted` = the worker stopped mid-send
 * (never re-sent: at most once); `gone` = the push service no longer knows the device.
 */
export const notificationStatuses = [
  'pending',
  'sending',
  'sent',
  'failed',
  'interrupted',
  'gone',
] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];
