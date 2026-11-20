import { IMPORT_DAILY_CAP_DEFAULT, ingestChannels, type IngestChannel } from './ingest/constants';

/** Maximum character count (Unicode code points) for card body. */
export const CARD_BODY_MAX = 2000;

/** Days a released username stays held for its previous owner (env-tunable default). */
export const USERNAME_HOLD_DAYS_DEFAULT = 30;

/** Profile lookups per member per hour before the limiter answers 429 (env-tunable default). */
export const PROFILE_LOOKUP_RATE_PER_HOUR_DEFAULT = 30;

/** Profile saves per member per hour before the limiter answers 429 (env-tunable default). */
export const PROFILE_UPDATE_RATE_PER_HOUR_DEFAULT = 30;

/** Longest first or last name on a profile. */
export const PROFILE_NAME_MAX = 60;

/** Longest free-text location on a profile. */
export const PROFILE_LOCATION_MAX = 100;

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

/** D174: maximum `limit` on public (anonymous) card lists. */
export const PUBLIC_PAGE_LIMIT_MAX = 50;

/** D175: anonymous public reads allowed per client IP per hour (in-process limiter). */
export const PUBLIC_READ_PER_HOUR = 600;

/** D182: public search requests per client IP per hour (in-process, its own bucket). */
export const PUBLIC_SEARCH_PER_HOUR = 120;

/** D182: new anonymous query embeddings per client IP per hour (DB-backed); over it, text-only. */
export const PUBLIC_QUERY_EMBED_PER_HOUR = 30;

/** D182: new anonymous query embeddings per hour across all IPs (DB-backed); over it, text-only. */
export const PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR = 300;

/** D182: results per public search (default and maximum). */
export const PUBLIC_SEARCH_LIMIT_DEFAULT = 10;
export const PUBLIC_SEARCH_LIMIT_MAX = 20;

/** D219: waitlist joins per client IP per hour, in-process (env WAITLIST_JOIN_PER_IP_PER_HOUR). */
export const WAITLIST_JOIN_PER_IP_PER_HOUR = 10;

/** D219: waitlist joins per email per hour, DB-backed (env WAITLIST_JOIN_PER_EMAIL_PER_HOUR). */
export const WAITLIST_JOIN_PER_EMAIL_PER_HOUR = 3;

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
export const RATE_MAGIC_LINK_PER_IP_DEFAULT = 20;

/** Magic-link callbacks allowed per client IP per hour. */
export const RATE_CALLBACK_PER_IP_DEFAULT = 30;

/** Random bytes in a magic-link or session token. */
export const TOKEN_BYTES = 32;

/** Minimum length of a token supplied through the environment (SMOKE_SESSION_TOKEN). */
export const MIN_SEEDED_TOKEN_LENGTH = 32;

/**
 * Per-channel overrides of the daily ingest cap (jobs per user per rolling day). Channels not
 * listed use INGEST_DAILY_CAP (env-overridable); Phase 13 sets `mcp` here. `import` counts rows (D190).
 */
export const INGEST_CHANNEL_DAILY_CAPS: Partial<Record<IngestChannel, number>> = {
  import: IMPORT_DAILY_CAP_DEFAULT,
};

/** The daily cap of every channel: its override, else `defaultCap`. */
export function ingestDailyCaps(defaultCap: number): Record<IngestChannel, number> {
  return Object.fromEntries(
    ingestChannels.map((c) => [c, INGEST_CHANNEL_DAILY_CAPS[c] ?? defaultCap]),
  ) as Record<IngestChannel, number>;
}
