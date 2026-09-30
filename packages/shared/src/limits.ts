/** Maximum character count (Unicode code points) for card body. */
export const CARD_BODY_MAX = 600;

/** Maximum character count for card title. */
export const CARD_TITLE_MAX = 120;

/** Maximum payload size in bytes (UTF-8). */
export const PAYLOAD_MAX_BYTES = 8192;

/** Database backstop for payload size in bytes (UTF-8). */
export const PAYLOAD_DB_BACKSTOP_BYTES = 9216;

/** Maximum number of rows in a table card. */
export const TABLE_MAX_ROWS = 12;

/** Maximum number of columns in a table card. */
export const TABLE_MAX_COLUMNS = 6;

/** Maximum number of fields in a calc card. */
export const CALC_MAX_FIELDS = 6;

/** Default page limit for listings. */
export const PAGE_LIMIT_DEFAULT = 20;

/** Maximum allowed page limit for listings. */
export const PAGE_LIMIT_MAX = 50;

/** Maximum character count for name fields. */
export const NAME_MAX = 80;

/** Maximum character count for slug fields. */
export const SLUG_MAX = 60;

/** Sign-in magic link lifetime in minutes (override: MAGIC_LINK_TTL_MINUTES). */
export const MAGIC_LINK_TTL_MINUTES_DEFAULT = 15;

/** Invite link lifetime in days (override: INVITE_TTL_DAYS). */
export const INVITE_TTL_DAYS_DEFAULT = 7;

/** Sliding session lifetime in days (override: SESSION_TTL_DAYS). */
export const SESSION_TTL_DAYS_DEFAULT = 90;

/** Minimum age of `last_seen_at` before an authenticated request slides the session. */
export const SESSION_TOUCH_INTERVAL_MS = 3_600_000;

/** Magic-link requests allowed per email address per hour. */
export const RATE_MAGIC_LINK_PER_EMAIL = 5;

/** Magic-link requests allowed per client IP per hour. */
export const RATE_MAGIC_LINK_PER_IP = 20;

/** Magic-link callbacks allowed per client IP per hour. */
export const RATE_CALLBACK_PER_IP = 30;

/** Random bytes in a magic-link or session token. */
export const TOKEN_BYTES = 32;

/** Minimum length of a token supplied through the environment (SMOKE_SESSION_TOKEN). */
export const MIN_SEEDED_TOKEN_LENGTH = 32;
