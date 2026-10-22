/** D164: the daily link check sweep (UTC), after `media-sweep` at 06:00. */
export const LINK_CHECK_CRON = '30 6 * * *';
/** Most links one sweep run checks. */
export const LINK_CHECK_BATCH = 100;
/** A checked link is due again after this many days, ± the jitter. */
export const LINK_CHECK_INTERVAL_DAYS = 30;
export const LINK_CHECK_JITTER_DAYS = 3;
/** After a definite failure that is not yet `dead`, check again the next day. */
export const LINK_CHECK_RETRY_DAYS = 1;
/** Consecutive definite failures that make a link `dead`. */
export const LINK_CHECK_DEAD_AFTER = 2;
/** Hosts probed in parallel; each host still gets one request at a time. */
export const LINK_CHECK_HOST_PARALLEL = 4;
/** Most bytes of an HTML answer read to find its title. */
export const LINK_CHECK_READ_BYTES = 262_144;
/** D165: manual "Check again" calls per user per hour. */
export const LINK_CHECK_RATE_PER_HOUR = 10;
/** D163: a snapshot job that lost the race with an edit is retried this many times. */
export const LINK_SNAPSHOT_REQUEUE_MAX = 1;
/** Longest error / title text kept on a check row. */
export const LINK_CHECK_TEXT_MAX = 200;
/** D167: longest shared caption kept as a locked-host link preview description (code points). */
export const LOCKED_CAPTION_MAX = 500;
