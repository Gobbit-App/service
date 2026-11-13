/**
 * 042 event card constants (D356–D371). API, worker and web read these, never literals; web imports
 * them from the zod-free `@gobbit/shared/event-constants` subpath. Env values may only lower the caps
 * (`cappedInt`), which the DB CHECK also backs.
 */

/** D362: who an event notifies. */
export const eventAudienceModes = ['everyone', 'people', 'me', 'nobody'] as const;
export type EventAudienceMode = (typeof eventAudienceModes)[number];

/** FR-010: notify-before units (all-day events use days only). */
export const eventNoticeUnits = ['minutes', 'hours', 'days'] as const;
export type EventNoticeUnit = (typeof eventNoticeUnits)[number];

/** D359: `event_notices.state`. */
export const eventNoticeStates = ['pending', 'planned', 'skipped'] as const;
export type EventNoticeState = (typeof eventNoticeStates)[number];

/** D359: why a notice was skipped. Per-person skips are decision events, not notice states. */
export const eventNoticeSkipReasons = [
  'past_at_save',
  'past_at_publish',
  'past_at_restore',
  'started',
] as const;
export type EventNoticeSkipReason = (typeof eventNoticeSkipReasons)[number];

/** D361: what a `notification_deliveries` row is about. */
export const notificationKinds = ['reminder', 'event'] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export const EVENT_UNIT_MS: Readonly<Record<EventNoticeUnit, number>> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** FR-010: one notice a day before, for everyone who can read it. */
export const EVENT_NOTIFY_DEFAULT = {
  before: [{ amount: 1, unit: 'days' }],
  audience: { mode: 'everyone', userIds: [] },
} as const;

/** D358: a timed event without an end lasts this long (not operator-tunable). */
export const EVENT_DEFAULT_LENGTH_MS = 3_600_000;

/** D371: most notify-before times (env `EVENT_NOTIFY_TIMES_MAX`; DB CHECK 3). */
export const EVENT_NOTIFY_TIMES_MAX = 3;
/** D371: longest notify-before, in days (env `EVENT_NOTIFY_BEFORE_MAX_DAYS`). */
export const EVENT_NOTIFY_BEFORE_MAX_DAYS = 365;
/** D371: furthest start from now, in days (env `EVENT_START_MAX_DAYS`). */
export const EVENT_START_MAX_DAYS = 1826;
/** D371: location length in code points (env `EVENT_LOCATION_MAX`; DB CHECK 200). */
export const EVENT_LOCATION_MAX = 200;
/** D371: hour (0–23, event zone) all-day notices go out (env `EVENT_ALLDAY_NOTICE_HOUR`). */
export const EVENT_ALLDAY_NOTICE_HOUR = 9;
/** D360: a notice missed by downtime is still sent up to this long after the start. */
export const EVENT_NOTICE_GRACE_MINUTES = 5;
/** D374: zone of shared events whose share carries none (env `INGEST_DEFAULT_TIME_ZONE`). */
export const INGEST_DEFAULT_TIME_ZONE = 'UTC';
