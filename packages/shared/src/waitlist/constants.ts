/** Phase 9 waitlist constants (D217–D220). The API, worker and landing page read these. */

/** Maximum note length in Unicode code points. */
export const WAITLIST_NOTE_MAX = 500;

/** Maximum `utm_source` length; values must match `WAITLIST_UTM_PATTERN`. */
export const WAITLIST_UTM_MAX = 64;
export const WAITLIST_UTM_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** How long a confirmation link works. */
export const WAITLIST_CONFIRM_TTL_DAYS = 7;

/** Pending entries are deleted this long after their link expired; removed ones after removal. */
export const WAITLIST_PENDING_RETENTION_DAYS = 30;

/** D220: weekly prune, Sundays 06:00. */
export const WAITLIST_PRUNE_CRON = '0 6 * * 0';
